import Phaser from 'phaser';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HAND_TYPE_LABELS, HandType } from '../../models/BattleTypes';
import { getCoefficient } from '../../engine/DamageCalculator';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { waitForDelay, waitForTween, waitForCounterTween } from '../../utils/AnimationUtils';
import { JuiceManager } from './JuiceManager';
import { FONT_FAMILY, DEPTH_DAMAGE, DEPTH_CENTER_BASE } from '../../constants/Layout';
import { SkillTiming, type SkillContext, type SkillEventBus } from '../../skills';
import type { PlayerCharacterId } from '../../models/Character';
import type { BattleConfig } from '../../models/BattleTypes';
import { getRun, buciCoefficientBonus } from '../../models/RunManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface DamageSettlementHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly battleConfig: BattleConfig | null;
  battle: BattleState;
  phase: GamePhase;
  damageSettlementCancelled: boolean;
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  centerDepthCounter: number;
  respondChainDepth: number;
  playerCharacterIds: PlayerCharacterId[];
  skillEventBus: SkillEventBus;
  initActiveSkills(): void;
  updateUIForPhase(): void;
  animateHealthBarDepletionAsync(target: 'enemy' | 'player', newVitality: number, duration: number): Promise<void>;
}

export class DamageSettlementManager {
  private host: DamageSettlementHost;
  private scene: Phaser.Scene;
  private juice: JuiceManager;

  constructor(host: DamageSettlementHost & Phaser.Scene) {
    this.host = host;
    this.scene = host;
    this.juice = new JuiceManager(host);
  }

  async playDamageSettlement(
    pattern: HandPattern,
    target: 'enemy' | 'player',
    isEmptyHand: boolean,
  ): Promise<void> {
    this.host.phase = 'animating';
    this.host.damageSettlementCancelled = false;

    const cards = [...this.host.centerCards];
    const sumRanks = pattern.cards.reduce((sum, c) => sum + (c.consideredAs?.rank ?? c.rank), 0);
    const coefficient = getCoefficient(pattern.type, pattern.length);
    const baseCoefficient = coefficient;
    const damageMultiplier = isEmptyHand ? 5 : 1;
    const finalDamage = Math.round(sumRanks * coefficient * damageMultiplier);

    const damageInfo = { sumRanks, coefficient, baseCoefficient, damageMultiplier, finalDamage };

    // 卜辞牌加成（仅局外循环中玩家造成伤害时）：匹配牌型的 coefficientBonus
    // 全部加法叠加进系数；同时抬升 baseCoefficient，保证后续技能（如章邯「绝守」）
    // 以 baseCoefficient 为基准重算时不丢失卜辞加成，系数标签也直接显示加成后数值。
    if (target === 'enemy' && this.host.battleConfig?.runMode) {
      const run = getRun();
      const bonus = run ? buciCoefficientBonus(run.buciCards, pattern.type) : 0;
      if (bonus > 0) {
        damageInfo.baseCoefficient += bonus;
        damageInfo.coefficient += bonus;
        damageInfo.finalDamage = Math.round(
          damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
        );
      }
    }

    const sourceCharId = target === 'enemy'
      ? (this.host.battle.player.characterId ?? this.host.playerCharacterIds[0]!)
      : (this.host.battle.enemyCharacterId ?? 'unknown');

    const { width, height } = this.host.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const isBombPattern = pattern.type === HandType.Bomb || pattern.type === HandType.Rocket;
    const counterText = this.host.add.text(centerX, centerY, '0', {
      fontSize: isBombPattern ? '108px' : '72px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: isBombPattern ? '#dd3300' : '#cc3333',
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 0, '#ff8800', 14, true, true);


    await this.stage1RevealCards(
      cards, counterText, damageInfo, pattern, target, sourceCharId,
    );
    if (this.host.damageSettlementCancelled) return;
    await waitForDelay(this.scene, 180);

    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
    );

    await this.stage2ShowCoefficient(
      counterText, pattern, damageInfo, damageInfo.baseCoefficient, isEmptyHand, target, sourceCharId,
    );
  }

  private async stage1RevealCards(
    cards: Phaser.GameObjects.Container[],
    counterText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    pattern: HandPattern,
    target: 'enemy' | 'player',
    sourceCharId: string,
  ): Promise<void> {
    let currentSum = 0;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      const consideredAsRank = card.getData('consideredAsRank') as number | undefined;
      const rank = consideredAsRank ?? (card.getData('rank') as number ?? 0);

      GameAudioManager.playSfx(this.scene, 'sfx_card_reveal');

      const floatText = this.host.add.text(card.x, card.y, `+${rank}`, {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#b08030',
        stroke: '#1a0800',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(DEPTH_DAMAGE + 1).setAlpha(0).setScale(0.5);

      await Promise.all([
        waitForTween(this.scene, {
          targets: floatText,
          alpha: 1,
          scaleX: 1.15,
          scaleY: 1.15,
          y: floatText.y - 40,
          duration: 180,
          ease: 'Back.easeOut',
        }),
        waitForTween(this.scene, {
          targets: card,
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 180,
          ease: 'Sine.easeIn',
        }),
      ]);

      const singleCard = {
        card,
        scoreText: floatText,
        baseScore: rank,
        scoreBonus: 0,
      };
      const singleCardCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: sourceCharId,
        pattern,
        target,
        damageInfo,
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
        centerCardContainers: this.host.centerCards,
        singleCard,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_SINGLE_CARD_SETTLEMENT, singleCardCtx);
      if (this.host.damageSettlementCancelled) break;

      const cardScore = rank + singleCard.scoreBonus;
      currentSum += cardScore;
      counterText.setText(`${currentSum}`);
      damageInfo.sumRanks += singleCard.scoreBonus;

      await this.host.skillEventBus.emit(SkillTiming.AFTER_SINGLE_CARD_SETTLEMENT, singleCardCtx);

      this.host.tweens.add({
        targets: floatText,
        alpha: 0,
        y: floatText.y - 100,
        duration: 400,
        ease: 'Sine.easeIn',
        onComplete: () => floatText.destroy(),
      });

      await waitForTween(this.scene, {
        targets: card,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: 'Sine.easeOut',
      });
    }
  }

  private async stage2ShowCoefficient(
    counterText: Phaser.GameObjects.Text,
    pattern: HandPattern,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    baseCoefficient: number,
    isEmptyHand: boolean,
    target: 'enemy' | 'player',
    sourceCharId: string,
  ): Promise<void> {
    if (this.host.damageSettlementCancelled) return;
    const { width, height } = this.host.scale;
    const centerX = width / 2;
    const centerY = height / 2;
    const typeLabel = HAND_TYPE_LABELS[pattern.type];

    await waitForTween(this.scene, {
      targets: counterText,
      x: centerX - 50,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    const coeffText = this.host.add.text(centerX + 60, centerY,
      `✖️ ${baseCoefficient}（${typeLabel}）`,
      {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#8a5a20',
        stroke: '#1a0800',
        strokeThickness: 3,
      },
    ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0)
      .setShadow(0, 0, '#ff8800', 14, true, true);

    await waitForTween(this.scene, {
      targets: coeffText,
      alpha: 1,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    const multiplierText = this.host.add.text(
      coeffText.x + coeffText.width + 16,
      centerY,
      `✖️ ${damageInfo.damageMultiplier}（伤害倍数）`,
      {
        fontSize: '36px',
        fontFamily: FONT_FAMILY,
        color: '#b08030',
        stroke: '#1a0800',
        strokeThickness: 3,
      },
    ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0)
      .setShadow(0, 0, '#ffaa00', 14, true, true);

    await waitForTween(this.scene, {
      targets: multiplierText,
      alpha: 1,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    const onCoeffCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      damageInfo,
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      centerCardContainers: this.host.centerCards,
      coefficientLabel: coeffText,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_COEFFICIENT_REVEALED, onCoeffCtx);

    const multiplierCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      isEmptyHand,
      damageInfo,
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      centerCardContainers: this.host.centerCards,
      multiplierLabel: multiplierText,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_DAMAGE_MULTIPLIER_REVEALED, multiplierCtx);

    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
    );

    await this.stage3ApplyDamage(counterText, coeffText, multiplierText, damageInfo, target, pattern, sourceCharId);
  }

  private async stage3ApplyDamage(
    counterText: Phaser.GameObjects.Text,
    coeffText: Phaser.GameObjects.Text,
    multiplierText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    target: 'enemy' | 'player',
    pattern: HandPattern,
    sourceCharId: string,
  ): Promise<void> {
    if (this.host.damageSettlementCancelled) return;
    const { height } = this.host.scale;

    const labelsToFade: Phaser.GameObjects.Text[] = [coeffText, multiplierText];

    const currentDisplay = parseInt(counterText.text, 10) || damageInfo.sumRanks;

    await Promise.all([
      Promise.all(labelsToFade.map(t =>
        waitForTween(this.scene, {
          targets: t,
          alpha: 0,
          duration: 600,
          ease: 'Sine.easeOut',
        }).then(() => t.destroy()),
      )),
      waitForCounterTween(this.scene, {
        from: currentDisplay,
        to: damageInfo.finalDamage,
        duration: 600,
        ease: 'Cubic.easeOut',
        onUpdate: (val) => counterText.setText(`${Math.round(val)}`),
      }),
    ]);

    if (damageInfo.finalDamage <= 0) {
      await waitForTween(this.scene, {
        targets: counterText,
        alpha: 0,
        duration: 1200,
        ease: 'Sine.easeOut',
      });
      counterText.destroy();
      return;
    }

    GameAudioManager.playSfx(this.scene, 'sfx_hurt');

    const barX = 120;
    const barW = 420;
    const barH = 34;
    const barTargetY = target === 'enemy' ? 56 : height - 374;
    const barCenterX = barX + barW / 2;
    const barCenterY = barTargetY + barH / 2;

    await waitForTween(this.scene, {
      targets: counterText,
      x: barCenterX,
      y: barCenterY,
      scaleX: 2.0,
      scaleY: 2.0,
      duration: 300,
      ease: 'Cubic.easeIn',
    });

    counterText.destroy();

    const battleObj = target === 'enemy' ? this.host.battle.enemy : this.host.battle.player;
    const newVitality = Math.max(0, battleObj.vitality - damageInfo.finalDamage);

    const isBomb = pattern.type === HandType.Bomb || pattern.type === HandType.Rocket;
    this.juice.hitstop(80);
    this.juice.shakeForDamage(damageInfo.finalDamage, isBomb);
    await Promise.all([
      this.juice.flashVictimSide(target),
      this.host.animateHealthBarDepletionAsync(target, newVitality, 300),
    ]);

    const healthDecreaseCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      playerCharacterIds: this.host.playerCharacterIds,
      damageInfo,
    };
    await this.host.skillEventBus.emit(SkillTiming.AFTER_HEALTH_DECREASE, healthDecreaseCtx);

    if (battleObj.vitality <= 0) return;

    const afterDmgCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
    };
    await this.host.skillEventBus.emit(SkillTiming.AFTER_DAMAGE, afterDmgCtx);
  }

  cancelDamageSettlement(): void {
    this.host.damageSettlementCancelled = true;

    const texts = this.scene.children.list.filter(
      c => c instanceof Phaser.GameObjects.Text &&
        (c.depth === DEPTH_DAMAGE || c.depth === DEPTH_DAMAGE + 1)
    ) as Phaser.GameObjects.Text[];

    for (const t of texts) {
      this.scene.tweens.add({
        targets: t,
        x: t.x + 8,
        duration: 30,
        yoyo: true,
        repeat: 5,
        ease: 'Sine.easeInOut',
      });

      this.scene.tweens.add({
        targets: t,
        scaleX: 0.3,
        scaleY: 0.3,
        alpha: 0,
        duration: 400,
        delay: 50,
        ease: 'Back.easeIn',
        onComplete: () => t.destroy(),
      });
    }

    for (const card of this.host.centerCards) {
      this.scene.tweens.add({
        targets: card,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 300,
        ease: 'Sine.easeIn',
        onComplete: () => card.destroy(),
      });
    }
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;

    this.host.battle.turnHolder = 'player';
    this.host.phase = 'player_init';
    this.host.initActiveSkills();
    this.host.updateUIForPhase();
    this.host.respondChainDepth = 0;
  }
}
