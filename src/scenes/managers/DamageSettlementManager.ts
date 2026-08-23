import Phaser from 'phaser';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HAND_TYPE_LABELS, HandType } from '../../models/BattleTypes';
import { getCoefficient } from '../../engine/DamageCalculator';
import {
  collectSeals,
  countSeal,
  QINGLONG_SCORE_BONUS,
  ZHUQUE_COEFFICIENT_BONUS,
} from '../../engine/FourSealEffects';
import type { FourSeal } from '../../models/FourSeal';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { waitForDelay, waitForTween, waitForCounterTween, animateCoefficientUpdate } from '../../utils/AnimationUtils';
import { ensureVfxTextures, VFX_TEX } from '../../utils/VfxTextures';
import { JuiceManager } from './JuiceManager';
import { FONT_FAMILY, DEPTH_DAMAGE, DEPTH_CENTER_BASE } from '../../constants/Layout';
import { SkillTiming, type SkillContext, type SkillEventBus } from '../../skills';
import type { PlayerCharacterId } from '../../models/Character';
import type { BattleConfig } from '../../models/BattleTypes';
import { getRun } from '../../models/RunManager';

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
  resetActiveSkillUses(mode?: 'all' | 'gain-turn'): void;
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
    // 伤害得分基准为牌面分数 score（视为牌用视为点数；无视为时取 score，旧数据兜底 rank）
    const sumRanks = pattern.cards.reduce((sum, c) => sum + (c.consideredAs?.rank ?? c.score ?? c.rank), 0);
    const coefficient = getCoefficient(pattern.type, pattern.length);
    const baseCoefficient = coefficient;
    const damageMultiplier = isEmptyHand ? 5 : 1;
    const finalDamage = Math.round(sumRanks * coefficient * damageMultiplier);

    const damageInfo = { sumRanks, coefficient, baseCoefficient, damageMultiplier, finalDamage };

    // 四象印：按牌面判定，敌我双方打出的带印牌都生效（敌方牌库常规无印，
    // 测试模式可给敌方塞印验证）。各印在各自时机触发（不再预先加成）：
    //   - 青龙：单牌伤害得分计算时（stage1），该牌数字 +10；
    //   - 朱雀：系数亮出时（stage2），系数 +1/张（先于技能事件，保证章邯「绝守」等重算不丢失）；
    //   - 玄武：单牌伤害结算动画完成后（stage1），回复打出方等同该牌得分的气数；
    //   - 白虎：单牌伤害结算后（stage1），额外完整结算一次该牌（该牌伤害 ×2）——
    //     经 settleSingleCard 的 extraSettlements 循环实现，额外结算会再次触发单牌结算技能。
    const seals: FourSeal[] = collectSeals(pattern.cards);

    const sourceCharId = target === 'enemy'
      ? (this.host.battle.player.characterId ?? this.host.playerCharacterIds[0]!)
      : (this.host.battle.enemyCharacterId ?? 'unknown');

    const { width, height } = this.host.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const isBombPattern = pattern.type === HandType.Bomb || pattern.type === HandType.Rocket;
    const counterText = this.host.add.text(centerX, centerY, '0', {
      fontSize: isBombPattern ? '112px' : '76px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: isBombPattern ? '#ff2200' : '#e04040',
      stroke: '#1a0500',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 4, '#ff8800', 18, true, true);


    await this.stage1RevealCards(
      cards, counterText, damageInfo, pattern, target, sourceCharId,
    );
    if (this.host.damageSettlementCancelled) return;
    await waitForDelay(this.scene, 180);

    // 所有牌伤害累加完成后、系数亮出之前：广播 ON_DAMAGE_ACCUMULATED
    // （孙膑「减灶」在此增加 sumRanks 与计数器显示，随后 finalDamage 重算自然包含加成）
    const onAccumulatedCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: sourceCharId,
      pattern,
      target,
      damageInfo,
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      centerCardContainers: this.host.centerCards,
      damageCounterText: counterText,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_DAMAGE_ACCUMULATED, onAccumulatedCtx);
    if (this.host.damageSettlementCancelled) return;

    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
    );

    await this.stage2ShowCoefficient(
      counterText, pattern, damageInfo, damageInfo.baseCoefficient, isEmptyHand, target, sourceCharId, seals,
    );
    if (this.host.damageSettlementCancelled) return;
  }

  private async stage1RevealCards(
    cards: Phaser.GameObjects.Container[],
    counterText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    pattern: HandPattern,
    target: 'enemy' | 'player',
    sourceCharId: string,
  ): Promise<void> {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      if (this.host.damageSettlementCancelled) break;
      await this.settleSingleCard(
        card, i, cards.length, counterText, damageInfo, pattern, target, sourceCharId,
      );
    }
  }

  /**
   * 单张牌的伤害结算循环（放大 → 技能/青龙 → 累加 → 后续技能/白虎/玄武 → 缩小）。
   *
   * 「单牌伤害额外结算一次」类效果（白虎印、李清照「豪放」、戚继光「荡寇」等）通过
   * singleCard.extraSettlements 声明次数：在**本轮放大动画结束、分数已累加**之后，
   * 再完整播放一轮结算（重新触发 ON_SINGLE_CARD_SETTLEMENT / AFTER_SINGLE_CARD_SETTLEMENT
   * 技能），因此额外结算同样会触发罗成「舞枪」、薛万彻「骁锐」等单牌结算技能；
   * 多个效果叠加 = 额外结算多次。
   */
  private async settleSingleCard(
    card: Phaser.GameObjects.Container,
    index: number,
    totalCards: number,
    counterText: Phaser.GameObjects.Text,
    damageInfo: NonNullable<SkillContext['damageInfo']>,
    pattern: HandPattern,
    target: 'enemy' | 'player',
    sourceCharId: string,
  ): Promise<void> {
    const consideredAsRank = card.getData('consideredAsRank') as number | undefined;
    const baseRank = card.getData('rank') as number ?? 0;
    // 牌面分数基准：视为牌沿用视为点数；无视为时用卡牌 score（初始=点数，技能可单独修改）
    const score = consideredAsRank ?? (card.getData('score') as number ?? baseRank);
    const cardSeal = card.getData('seal') as FourSeal | undefined;

    // 白虎印：带白虎印的牌在基础轮结算完成后，总是再额外结算一次该牌。
    // 由本地 remainingExtra 控制（额外轮不再叠加白虎，避免无限递归）。
    const baihuExtra = cardSeal === 'baihu' ? 1 : 0;

    // 待执行的额外结算轮数（白虎 + 豪放/荡寇等技能声明的次数，可叠加）
    let remainingExtra = 0;
    // 当前轮是否为额外结算轮
    let isExtraRound = false;
    let round = 0;

    do {
      if (this.host.damageSettlementCancelled) return;

      GameAudioManager.playSfx(this.scene, 'sfx_card_reveal');

      const floatText = this.host.add.text(card.x, card.y, `+${score}`, {
        fontSize: '40px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: '#e09030',
        stroke: '#1a0800',
        strokeThickness: 4,
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
        baseScore: score,
        scoreBonus: 0,
        // 是否为本手牌最后一张：荆轲「匕现」等结算末张触发的技能据此判定。
        // 额外结算轮保持与基础轮一致的 isLastCard，保证末张技能在额外结算同样触发。
        isLastCard: index === totalCards - 1,
        // 本次结算中的序号（0 起）：程咬金「猛斧」等"前三张牌"技能据此判定
        index,
        // 额外结算次数：本轮技能（豪放/荡寇）可累加声明需要额外结算的轮数
        extraSettlements: 0,
        // 当前轮是否为额外结算（基础轮 false，额外轮 true）
        isExtraSettlement: isExtraRound,
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
        // 中央累计伤害计数器：结算类技能（如周处「励心」）可读取/改写
        damageCounterText: counterText,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_SINGLE_CARD_SETTLEMENT, singleCardCtx);
      if (this.host.damageSettlementCancelled) return;

      // 李离「伏剑」永久禁分（管线兜底，脱离李离在场）：敌方打出的该花色牌
      // 结算伤害永不计分。李离已离队的后续对局中 LiLiFuJianBan 技能不再注册，
      // 故在技能 emit 之后覆盖式强制归零（幂等：李离在场时技能 priority 200
      // 已归零，此处数值一致，不重复播动画）。
      const suitBans = this.host.battle.permanentSuitBans;
      if (target === 'player' && suitBans && suitBans.length > 0) {
        const cardSuit = card.getData('suit') as string | undefined;
        if (cardSuit && (suitBans as string[]).includes(cardSuit)) {
          singleCard.scoreBonus = -singleCard.baseScore;
        }
      }

      // 技能声明的额外结算次数累加进剩余轮数（豪放/荡寇等"额外结算一次"类技能；
      // 它们在额外轮（isExtraSettlement）中 filter 返回 false，不会递归叠加）
      remainingExtra += singleCard.extraSettlements ?? 0;

      // 青龙印：单牌伤害得分计算时触发（技能之后无条件 +10），
      // 印金光闪烁一下（伴金光音效），然后弹出的单牌伤害数字增加 10。
      if (cardSeal === 'qinglong') {
        GameAudioManager.playSfx(this.scene, 'sfx_seal_trigger');
        await this.flashSealGlow(card);
        singleCard.scoreBonus += QINGLONG_SCORE_BONUS;
        const shownNow = parseInt(floatText.text.replace('+', ''), 10) || score;
        await waitForCounterTween(this.scene, {
          from: shownNow,
          to: score + singleCard.scoreBonus,
          duration: 300,
          ease: 'Cubic.easeOut',
          onUpdate: (val) => floatText.setText(`+${Math.round(val)}`),
        });
      }

      const cardScore = score + singleCard.scoreBonus;
      // 以中央计数器当前显示值为基准继续累加：AFTER 类技能（如周处「励心」）
      // 可能已放大显示值（含 delta），直接基于显示值累加才能保持后续一致；
      // damageInfo.sumRanks 由各技能与下方 scoreBonus 累加同步到同一终值。
      const newSum = (parseInt(counterText.text, 10) || 0) + cardScore;
      counterText.setText(`${newSum}`);
      damageInfo.sumRanks += singleCard.scoreBonus;

      await this.host.skillEventBus.emit(SkillTiming.AFTER_SINGLE_CARD_SETTLEMENT, singleCardCtx);
      if (this.host.damageSettlementCancelled) return;

      // 白虎印：本张牌带白虎印时，在基础轮结算完成后额外结算一次该牌。
      // 印金光闪烁一下作提示（基础轮触发一次，额外轮不再叠加）。
      if (round === 0 && baihuExtra > 0) {
        GameAudioManager.playSfx(this.scene, 'sfx_seal_trigger');
        await this.flashSealGlow(card);
        remainingExtra += baihuExtra;
      }

      // 玄武印：单牌伤害结算动画播放完成后触发。
      // 印金光闪烁一下（伴金光音效），然后跳出与刚才分数相同的绿色数字（前面带加号），回复打出方等量气数。
      if (cardSeal === 'xuanwu') {
        GameAudioManager.playSfx(this.scene, 'sfx_seal_trigger');
        await this.flashSealGlow(card);
        await this.healFromCard(card, cardScore, target);
      }

      this.host.tweens.add({
        targets: floatText,
        alpha: 0,
        y: floatText.y - 100,
        duration: 400,
        ease: 'Sine.easeIn',
        onComplete: () => floatText.destroy(),
      });

      // 放大动画结束、分数累加后，缩小动画（额外结算在该缩小动画之后开始）
      await waitForTween(this.scene, {
        targets: card,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: 'Sine.easeOut',
      });

      // 本轮结束：若还有剩余额外结算轮，进入下一轮（重新放大 → 技能 → 累加）
      round += 1;
      if (remainingExtra > 0) {
        remainingExtra -= 1;
        isExtraRound = true;
        continue;
      }
      break;
    } while (!this.host.damageSettlementCancelled);
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
        fontSize: '40px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: '#b06a10',
        stroke: '#1a0800',
        strokeThickness: 4,
      },
    ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0)
      .setShadow(0, 2, '#ff8800', 16, true, true);

    await waitForTween(this.scene, {
      targets: coeffText,
      alpha: 1,
      duration: 600,
      ease: 'Sine.easeOut',
    });

    // 朱雀印：系数亮出时机触发，优先级高于技能 ——
    // 所有牌上朱雀印的金光闪一下，然后系数增加（每张 +1，同时抬 baseCoefficient）。
    // 先于 ON_COEFFICIENT_REVEALED 技能事件应用，保证章邯「绝守」等以 baseCoefficient
    // 为基准重算的技能不丢失朱雀加成。
    const zhuqueCount = countSeal(seals, 'zhuque');
    if (zhuqueCount > 0) {
      GameAudioManager.playSfx(this.scene, 'sfx_seal_trigger');
      await this.flashAllZhuqueSeals();
      const zhuqueBonus = ZHUQUE_COEFFICIENT_BONUS * zhuqueCount;
      const fromCoeff = damageInfo.baseCoefficient;
      damageInfo.baseCoefficient += zhuqueBonus;
      damageInfo.coefficient += zhuqueBonus;
      damageInfo.finalDamage = Math.round(
        damageInfo.sumRanks * damageInfo.coefficient * damageInfo.damageMultiplier,
      );
      await animateCoefficientUpdate(
        this.scene, coeffText, typeLabel, fromCoeff, damageInfo.baseCoefficient, 500,
      );
    }

    const multiplierText = this.host.add.text(
      coeffText.x + coeffText.width + 16,
      centerY,
      `✖️ ${damageInfo.damageMultiplier}（伤害倍数）`,
      {
        fontSize: '40px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: '#e09030',
        stroke: '#1a0800',
        strokeThickness: 4,
      },
    ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0)
      .setShadow(0, 2, '#ffaa00', 16, true, true);

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
      // AFTER_DAMAGE 技能可读取本次伤害信息（如青州兵「精悍」按 finalDamage 回血）
      damageInfo,
    };
    if (opts.emitEvents) {
      await this.host.skillEventBus.emit(SkillTiming.AFTER_DAMAGE, afterDmgCtx);
    }
  }

  /**
   * 四象印金光闪烁：金色光晕自印下亮起 + 冲击环扩散 + 星形火花迸溅，
   * 印徽标 tint 金色并做带回弹的放大脉冲，模拟「金光一闪」。
   * 卡面印徽标引用在 CardVisual.createPokerCardVisual 中存入 card.getData('sealImg')。
   */
  private async flashSealGlow(card: Phaser.GameObjects.Container): Promise<void> {
    const sealImg = card.getData('sealImg') as Phaser.GameObjects.Image | undefined;
    if (!sealImg) return;
    ensureVfxTextures(this.scene);
    const depth = card.depth + 60;

    // 1) 金色光晕：自印下亮起后缓缓消散
    const glow = this.host.add.image(card.x, card.y, VFX_TEX.softGlow)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffc94d)
      .setScale(0.3)
      .setAlpha(0);
    this.host.tweens.add({
      targets: glow,
      alpha: 0.95,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 130,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.host.tweens.add({
          targets: glow,
          alpha: 0,
          scaleX: 2.1,
          scaleY: 2.1,
          duration: 380,
          ease: 'Sine.easeIn',
          onComplete: () => glow.destroy(),
        });
      },
    });

    // 2) 冲击环：金色圆环向外扩散
    const ring = this.host.add.image(card.x, card.y, VFX_TEX.ring)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffd45c)
      .setScale(0.3)
      .setAlpha(0.9);
    this.host.tweens.add({
      targets: ring,
      scaleX: 2.0,
      scaleY: 2.0,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // 3) 星形火花：金光迸溅
    const emitter = this.host.add.particles(card.x, card.y, VFX_TEX.spark, {
      speed: { min: 60, max: 260 },
      angle: { min: 0, max: 360 },
      gravityY: 40,
      lifespan: { min: 300, max: 520 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 180 },
      tint: [0xffe08a, 0xffc94d, 0xfff3c4],
      blendMode: Phaser.BlendModes.ADD,
      quantity: 10,
      emitting: false,
    });
    emitter.setDepth(depth + 1);
    emitter.explode(10);
    emitter.once('complete', () => emitter.destroy());

    // 4) 印徽标本体：金光染色 + 带回弹的放大脉冲
    const baseScale = sealImg.scaleX;
    sealImg.setTint(0xffd45c);
    sealImg.setAlpha(1);
    await waitForTween(this.scene, {
      targets: sealImg,
      scaleX: baseScale * 1.85,
      scaleY: baseScale * 1.85,
      duration: 120,
      ease: 'Back.easeOut',
    });
    await waitForTween(this.scene, {
      targets: sealImg,
      scaleX: baseScale,
      scaleY: baseScale,
      alpha: 0.92,
      duration: 300,
      ease: 'Sine.easeInOut',
      onComplete: () => sealImg.clearTint(),
    });
  }

  /** 朱雀印触发：当前打出的所有带朱雀印的牌同时金光闪烁。 */
  private async flashAllZhuqueSeals(): Promise<void> {
    const flashTasks: Promise<void>[] = [];
    for (const card of this.host.centerCards) {
      if (card.getData('seal') === 'zhuque') {
        flashTasks.push(this.flashSealGlow(card));
      }
    }
    if (flashTasks.length > 0) {
      await Promise.all(flashTasks);
    }
  }

  /**
   * 玄武印：单牌伤害结算动画播放完成后触发 —— 回复打出方等同该牌得分的气数
   * （上限 vitalityMax，满血不触发），并从该牌位置跳出绿色 +N 数字。
   * target 为本次伤害结算的受伤方；玄武回复的是打出方（玩家打敌方回玩家，敌方打玩家回敌方）。
   */
  private async healFromCard(
    card: Phaser.GameObjects.Container,
    amount: number,
    target: 'enemy' | 'player',
  ): Promise<void> {
    const battleObj = target === 'enemy' ? this.host.battle.player : this.host.battle.enemy;
    const before = battleObj.vitality;
    battleObj.vitality = Math.min(battleObj.vitalityMax, before + amount);
    const actual = battleObj.vitality - before;
    if (actual <= 0) return;

    GameAudioManager.playSfx(this.scene, 'sfx_heal');
    this.host.updateVitalityBars();

    const text = this.scene.add.text(card.x, card.y, `+${actual}`, {
      fontSize: '40px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#00ff44',
      stroke: '#003300',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 2, '#66ff88', 14, true, true);

    await waitForTween(this.scene, {
      targets: text,
      y: text.y - 80,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /**
   * 取消本次伤害结算（清空伤害数字与中央牌，停止后续扣血）。
   * @param gainTurn 是否令玩家获得牌权。张飞「断喝」描述明确「你获得牌权」→ true（默认）；
   *   庄周「逍遥」仅「伤害无效」→ false（牌权维持出牌方，由 BattleFlowManager 走正常结算后流程）。
   */
  cancelDamageSettlement(gainTurn: boolean = true): void {
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

    // 仅「获得牌权」型取消（张飞断喝）才转移牌权给玩家；
    // 庄周逍遥只取消伤害，牌权仍归出牌方（调用方走正常结算后流程）
    if (!gainTurn) return;

    this.host.battle.turnHolder = 'player';
    this.host.phase = 'player_init';
    this.host.initActiveSkills();
    // 取消结算后玩家获得牌权：重置「每次获得牌权限一次」类主动技次数
    this.host.resetActiveSkillUses('gain-turn');
    this.host.updateUIForPhase();
    this.host.respondChainDepth = 0;
  }
}
