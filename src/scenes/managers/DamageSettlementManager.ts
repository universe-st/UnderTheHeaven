import type Phaser from 'phaser';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HAND_TYPE_LABELS } from '../../models/BattleTypes';
import { getCoefficient } from '../../engine/DamageCalculator';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { waitForDelay, waitForTween, waitForCounterTween } from '../../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_DAMAGE } from '../../constants/Layout';
import { SkillTiming, type SkillContext, type SkillEventBus } from '../../skills';
import type { PlayerCharacterId } from '../../models/Character';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface DamageSettlementHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  battle: BattleState;
  phase: GamePhase;
  damageSettlementCancelled: boolean;
  centerCards: Phaser.GameObjects.Container[];
  playerCharacterIds: PlayerCharacterId[];
  skillEventBus: SkillEventBus;
  animateHealthBarDepletionAsync(target: 'enemy' | 'player', newVitality: number, duration: number): Promise<void>;
}

export class DamageSettlementManager {
  private host: DamageSettlementHost;
  private scene: Phaser.Scene;

  constructor(host: DamageSettlementHost & Phaser.Scene) {
    this.host = host;
    this.scene = host;
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
    const sourceCharId = target === 'enemy'
      ? (this.host.battle.player.characterId ?? this.host.playerCharacterIds[0]!)
      : (this.host.battle.enemyCharacterId ?? 'unknown');

    const { width, height } = this.host.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const counterText = this.host.add.text(centerX, centerY, '0', {
      fontSize: '72px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#cc3333',
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
      counterText, pattern, damageInfo, baseCoefficient, isEmptyHand, target, sourceCharId,
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
    await this.host.animateHealthBarDepletionAsync(target, newVitality, 300);

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
    this.applyPostDamageEffects(pattern, target, damageInfo.finalDamage);
  }

  private applyPostDamageEffects(_pattern: HandPattern, _target: 'enemy' | 'player', _finalDamage: number): void {
  }
}
