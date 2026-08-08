import Phaser from 'phaser';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HAND_TYPE_LABELS, HandType } from '../../models/BattleTypes';
import { getCoefficient } from '../../engine/DamageCalculator';
import { collectSeals, applySealBonuses, hasBaihu, hasXuanwu } from '../../engine/FourSealEffects';
import type { FourSeal } from '../../models/FourSeal';
import { SEAL_LABELS, SEAL_IMAGE_KEYS, SEAL_SOURCE_SIZE } from '../../models/FourSeal';
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
  updateVitalityBars(): void;
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

    // 四象印：仅玩家打出时生效（敌方牌库无印）。
    // 青龙 +10 得分、朱雀 系数 +1，必须在卜辞加成与任何技能事件之前应用，
    // 保证后续按 damageInfo 重算的技能（章邯「绝守」等）包含四印加成。
    const seals: FourSeal[] = target === 'enemy' ? collectSeals(pattern.cards) : [];
    if (seals.length > 0) {
      applySealBonuses(damageInfo, seals);
      damageInfo.finalDamage = Math.round(
        damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
      );
    }

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

    // 四象印提示标签（青龙/朱雀的数值加成已在 damageInfo 中生效）
    if (seals.length > 0) {
      await this.showSealLabels(seals);
      if (this.host.damageSettlementCancelled) return;
    }

    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
    );

    await this.stage2ShowCoefficient(
      counterText, pattern, damageInfo, damageInfo.baseCoefficient, isEmptyHand, target, sourceCharId, seals,
    );
    if (this.host.damageSettlementCancelled) return;

    // 玄武印：打出时回复等同得分的气数（满血不触发）
    if (hasXuanwu(seals) && this.host.battle.player.vitality < this.host.battle.player.vitalityMax) {
      await this.healPlayer(damageInfo.sumRanks);
    }
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
    seals: readonly FourSeal[],
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

    await this.stage3ApplyDamage(
      counterText, coeffText, multiplierText, damageInfo, target, pattern, sourceCharId,
      { emitEvents: true, fadeLabels: true },
    );
    if (this.host.damageSettlementCancelled) return;

    // 白虎印：伤害数字结算两次（每次等额，观感连击；总伤 = 单次 ×2）。
    // 第二次为纯扣血结算，不再触发技能事件，避免技能/卜辞效果重复叠加。
    if (hasBaihu(seals) && target === 'enemy' && this.host.battle.enemy.vitality > 0) {
      await this.secondBaihuSettlement(pattern, damageInfo, target);
    }
  }

  private async stage3ApplyDamage(
    counterText: Phaser.GameObjects.Text,
    coeffText: Phaser.GameObjects.Text,
    multiplierText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    target: 'enemy' | 'player',
    pattern: HandPattern,
    sourceCharId: string,
    opts: { emitEvents: boolean; fadeLabels: boolean },
  ): Promise<void> {
    if (this.host.damageSettlementCancelled) return;
    const { height } = this.host.scale;

    const labelsToFade: Phaser.GameObjects.Text[] = opts.fadeLabels ? [coeffText, multiplierText] : [];

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
    if (opts.emitEvents) {
      await this.host.skillEventBus.emit(SkillTiming.AFTER_HEALTH_DECREASE, healthDecreaseCtx);
    }

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
    if (opts.emitEvents) {
      await this.host.skillEventBus.emit(SkillTiming.AFTER_DAMAGE, afterDmgCtx);
    }
  }

  /**
   * 四象印提示：居中显示「四象·青龙 ×N」等标签（含印徽标小图）。
   */
  private async showSealLabels(seals: readonly FourSeal[]): Promise<void> {
    const { width, height } = this.host.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const counts = new Map<FourSeal, number>();
    for (const s of seals) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const items: Array<{ seal: FourSeal; count: number }> = [];
    for (const [seal, count] of counts) {
      items.push({ seal, count });
    }

    const labelObjs: Phaser.GameObjects.GameObject[] = [];
    const startY = centerY - 190;
    const yStep = 54;
    for (let i = 0; i < items.length; i++) {
      const { seal, count } = items[i]!;
      const y = startY + i * yStep;
      const key = SEAL_IMAGE_KEYS[seal];
      if (this.scene.textures.exists(key)) {
        const img = this.scene.add.image(centerX - 112, y, key);
        img.setScale(40 / SEAL_SOURCE_SIZE);
        img.setDepth(DEPTH_DAMAGE + 2);
        labelObjs.push(img);
      }
      const txt = this.scene.add.text(
        centerX - 80, y,
        `四象·${SEAL_LABELS[seal]}${count > 1 ? ` ×${count}` : ''}`,
        {
          fontSize: '28px',
          fontFamily: FONT_FAMILY,
          color: '#e8d5a3',
          stroke: '#1a0800',
          strokeThickness: 3,
        },
      ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE + 2).setAlpha(0);
      labelObjs.push(txt);
      this.scene.tweens.add({
        targets: txt,
        alpha: 1,
        duration: 250,
        ease: 'Sine.easeOut',
      });
    }

    await waitForDelay(this.scene, 900);
    await Promise.all(labelObjs.map((obj) => new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: obj,
        alpha: 0,
        duration: 250,
        ease: 'Sine.easeIn',
        onComplete: () => {
          obj.destroy();
          resolve();
        },
      });
    })));
  }

  /**
   * 白虎印：伤害数字第二次结算（每次等额，观感连击）。
   * 纯扣血结算，不触发技能事件。
   */
  private async secondBaihuSettlement(
    pattern: HandPattern,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    target: 'enemy' | 'player',
  ): Promise<void> {
    if (this.host.damageSettlementCancelled) return;
    const { width, height } = this.host.scale;
    const centerX = width / 2;
    const centerY = height / 2;
    const finalDamage = damageInfo.finalDamage;

    const label = this.scene.add.text(centerX, centerY - 80, '白虎·再击', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#1a0800',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE + 1).setAlpha(0);
    this.scene.tweens.add({
      targets: label,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });

    const counterText = this.scene.add.text(centerX, centerY, '0', {
      fontSize: '72px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#cc3333',
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 0, '#ff8800', 14, true, true);

    const battleObj = target === 'enemy' ? this.host.battle.enemy : this.host.battle.player;
    // 剩余血量不足时按实际扣血显示，避免数字超出剩余血量
    const displayDamage = Math.min(finalDamage, battleObj.vitality);

    await waitForCounterTween(this.scene, {
      from: 0,
      to: displayDamage,
      duration: 500,
      ease: 'Cubic.easeOut',
      onUpdate: (val) => counterText.setText(`${Math.round(val)}`),
    });

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
    label.destroy();

    const newVitality = Math.max(0, battleObj.vitality - displayDamage);
    const isBomb = pattern.type === HandType.Bomb || pattern.type === HandType.Rocket;
    this.juice.hitstop(60);
    this.juice.shakeForDamage(displayDamage, isBomb);
    await Promise.all([
      this.juice.flashVictimSide(target),
      this.host.animateHealthBarDepletionAsync(target, newVitality, 300),
    ]);
  }

  /**
   * 玄武印：回复玩家气数（上限 vitalityMax），绿色 +N 数字 + sfx_heal。
   */
  private async healPlayer(amount: number): Promise<void> {
    const battleObj = this.host.battle.player;
    const before = battleObj.vitality;
    battleObj.vitality = Math.min(battleObj.vitalityMax, before + amount);
    const actual = battleObj.vitality - before;
    if (actual <= 0) return;

    GameAudioManager.playSfx(this.scene, 'sfx_heal');
    this.host.updateVitalityBars();

    const { height } = this.host.scale;
    const barX = 120;
    const barW = 420;
    const barH = 34;
    const barCenterX = barX + barW / 2;
    const barCenterY = height - 374 + barH / 2;

    const text = this.scene.add.text(barCenterX, barCenterY, `+${actual}`, {
      fontSize: '36px',
      fontFamily: FONT_FAMILY,
      color: '#00ff44',
      stroke: '#003300',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 0, '#66ff88', 10, true, true);

    await waitForTween(this.scene, {
      targets: text,
      y: barCenterY - 60,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
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
