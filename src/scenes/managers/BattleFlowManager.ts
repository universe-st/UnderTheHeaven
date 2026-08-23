import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { shuffleDeck, sortHand, sortPlayedCards, cardScoreBoostKey } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HandType, HAND_TYPE_LABELS } from '../../models/BattleTypes';
import { identifyHand } from '../../engine/HandRecognizer';
import { decidePlay } from '../../engine/AIBrain';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { VoiceManager, getVoiceKeyForPlay, getRandomPassVoice } from '../../utils/VoiceManager';
import type { PlayerCharacterId } from '../../models/Character';

import { canPlayerRosterBeat } from '../../engine/CharacterAbilities';
import { SkillTiming } from '../../skills';
import type { SkillContext, SkillEventBus, SkillRunner } from '../../skills';
import { getBlockedResponseTypes } from '../../skills/PassiveSkillUtils';
import { plunderRandomCardsFromPool } from '../../skills/QiangdaoJianJing';
import { findHintPlays } from '../../engine/findHintPlays';
import { waitForDelay, waitForTween } from '../../utils/AnimationUtils';
import type { CardDisplayManager } from './CardDisplayManager';
import type { DamageSettlementManager } from './DamageSettlementManager';
import type { BattleConfig, RunModeConfig } from '../../models/BattleTypes';
import type { NodeType } from '../../models/RunState';
import { tongbaoReward, calcDestinyLoss, isRunOver, isRunComplete } from '../../models/RunState';
import { applyBattleResult, consumePendingInterest, getRun, save } from '../../models/RunManager';
import { triggerDestinyUpOnBattleWin } from '../../engine/BuciEffects';
import { UIFactory } from '../../utils/UIFactory';
import {
  FONT_FAMILY, CARD_W, CARD_H,
  DEPTH_CENTER_BASE, DEPTH_OVERLAY_TEXT, DEPTH_OVERLAY,
} from '../../constants/Layout';
import { loadAudioSettings } from '../../AudioSettings';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export interface BattleFlowHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly battleConfig: BattleConfig | null;
  readonly isTestMode: boolean;
  battle: BattleState;
  phase: GamePhase;
  selectedIndices: Set<number>;
  cardObjects: Phaser.GameObjects.Container[];
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  playerCharacterIds: PlayerCharacterId[];
  respondChainDepth: number;
  damageSettlementCancelled: boolean;
  skillEventBus: SkillEventBus;
  skillRunner: SkillRunner;

  getSelectedCards(): Card[];
  updateUIForPhase(): void;
  updateTurnIndicator(who: 'player' | 'enemy'): void;
  initActiveSkills(): void;
  resetActiveSkillUses(mode?: 'all' | 'gain-turn'): void;
  updatePatternHint(): void;
}

export class BattleFlowManager {
  private host: BattleFlowHost;
  private scene: Phaser.Scene;
  private cardDisplay: CardDisplayManager;
  private damageSettlement: DamageSettlementManager;
  private stopBattleBgm: () => void;

  constructor(
    host: BattleFlowHost & Phaser.Scene,
    cardDisplay: CardDisplayManager,
    damageSettlement: DamageSettlementManager,
    stopBattleBgm: () => void,
  ) {
    this.host = host;
    this.scene = host;
    this.cardDisplay = cardDisplay;
    this.damageSettlement = damageSettlement;
    this.stopBattleBgm = stopBattleBgm;
  }

  async onPlayClick(): Promise<void> {
    if (this.host.phase !== 'player_init' && this.host.phase !== 'player_respond') return;

    const selected = this.host.getSelectedCards();
    if (selected.length === 0) return;

    let pattern = identifyHand(selected);

    if (!pattern) {
      const playerChar = this.host.battle.player.characterId;
      if (playerChar) {
        const ctx: SkillContext = {
          gameScene: this.scene,
          battle: this.host.battle,
          sourceCharacterId: playerChar,
          playerCharacterIds: this.host.playerCharacterIds,
          enemyCharacterId: this.host.battle.enemyCharacterId,
          handValidation: {
            hand: this.host.battle.player.hand,
            candidateCards: selected,
            basePattern: null,
            additionalPatterns: [],
          },
        };
        const additionalPatterns = await this.host.skillRunner.modifyHandValidation(ctx);
        if (additionalPatterns.length > 0) {
          pattern = additionalPatterns[0]!;
        }
      }
    }

    if (!pattern) return;

    if (this.host.phase === 'player_respond') {
      if (!this.host.battle.lastPlay) return;
      const blockedTypes = getBlockedResponseTypes(
        this.host.battle.enemyCharacterId,
        this.host.battle.lastPlay,
      );
      if (blockedTypes.includes(pattern.type)) return;
      const canBeatPlay = canPlayerRosterBeat(
        this.host.playerCharacterIds,
        pattern,
        this.host.battle.lastPlay,
      );
      if (!canBeatPlay) return;
    }

    GameAudioManager.playSfx(this.scene, 'sfx_play_card');
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      GameAudioManager.playSfx(this.scene, 'sfx_bomb');
    }
    await this.executePlay(selected, pattern);
  }

  async onPassClick(): Promise<void> {
    if (this.host.phase !== 'player_respond') return;

    await this.executePass('player');
  }

  onHintClick(): void {
    if (this.host.phase !== 'player_init' && this.host.phase !== 'player_respond') return;

    const hand = this.host.battle.player.hand;
    const lastPlay = this.host.phase === 'player_respond' ? this.host.battle.lastPlay : null;
    const blockedTypes = lastPlay
      ? getBlockedResponseTypes(this.host.battle.enemyCharacterId, lastPlay)
      : [];

    const candidates = findHintPlays(hand, lastPlay, (p) => {
      if (blockedTypes.includes(p.type)) return false;
      if (!lastPlay) return true;
      return canPlayerRosterBeat(this.host.playerCharacterIds, p, lastPlay);
    });
    if (candidates.length === 0) return;

    const selectedUids = new Set(this.host.getSelectedCards().map(c => c.uid));
    const currentIdx = candidates.findIndex(c =>
      c.cards.length === selectedUids.size && c.cards.every(cc => selectedUids.has(cc.uid)),
    );
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % candidates.length : 0;
    const choice = candidates[nextIdx]!;

    this.host.selectedIndices.clear();
    for (const card of choice.cards) {
      const idx = hand.findIndex(h => h.uid === card.uid);
      if (idx >= 0) this.host.selectedIndices.add(idx);
    }

    this.cardDisplay.renderPlayerHand();
    this.host.updatePatternHint();
  }

  async executePlay(cards: Card[], pattern: HandPattern): Promise<void> {
    const prevPhase = this.host.phase;
    this.host.phase = 'animating';

    for (const idx of this.host.selectedIndices) {
      const cardObj = this.host.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        this.host.tweens.killTweensOf(cardObj);
        const glowG = cardObj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
        if (glowG) {
          this.host.tweens.killTweensOf(glowG);
        }
      }
    }

    const isInit = prevPhase === 'player_init';
    const isBombOnNonBomb = !isInit &&
      (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) &&
      this.host.battle.lastPlay !== null &&
      this.host.battle.lastPlay.type !== HandType.Bomb &&
      this.host.battle.lastPlay.type !== HandType.Rocket;
    const voiceKey = getVoiceKeyForPlay(pattern, isInit, isBombOnNonBomb);
    VoiceManager.play(this.scene, voiceKey);

    const playerHand = this.host.battle.player.hand;
    const indicesToRemove = this.findCardIndices(playerHand, cards);

    const displayMap = new Map<string, Phaser.GameObjects.Container>();
    for (const idx of this.host.selectedIndices) {
      const cardObj = this.host.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        const handCard = playerHand[idx]!;
        displayMap.set(handCard.uid, cardObj);
        const arrIdx = this.host.cardObjects.indexOf(cardObj);
        if (arrIdx >= 0) this.host.cardObjects.splice(arrIdx, 1);
      }
    }

    this.host.selectedIndices.clear();

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      const pc = playerHand[i]!;
      playedCards.push({ ...pc });
    }

    for (const pc of pattern.cards) {
      if (pc.consideredAs) {
        for (const cd of playedCards) {
          if (cd.uid === pc.uid) {
            cd.consideredAs = { ...pc.consideredAs };
            break;
          }
        }
      }
    }
    for (const i of indicesToRemove) {
      playerHand.splice(i, 1);
    }
    this.host.battle.player.discardPile.push(...playedCards.filter(c => !c.isTemp));

    const sortedPlayed = sortPlayedCards(playedCards);
    const animatedCards: Phaser.GameObjects.Container[] = [];
    for (const card of sortedPlayed) {
      const display = displayMap.get(card.uid);
      if (display) {
        if (card.consideredAs) {
          display.setData('consideredAsRank', card.consideredAs.rank);
          display.setData('consideredAsLabel', `视为 ♠${card.consideredAs.rankLabel}`);
        }
        animatedCards.push(display);
        displayMap.delete(card.uid);
      }
    }
    for (const display of displayMap.values()) {
      animatedCards.push(display);
    }

    for (const card of animatedCards) {
      this.cardDisplay.updateCardShadowGlow(card, false);
    }

    this.host.battle.lastPlay = pattern;
    this.host.battle.turnHolder = 'player';
    // 关羽「武圣」判定依据：仅持有牌权（player_init）主动出牌时记录红牌数，
    // 跟牌（player_respond）时为 0；对方放弃响应而结算该牌时由技能消费。
    this.host.battle.player.pendingRedCount = prevPhase === 'player_init'
      ? playedCards.filter(c => c.suit === 'heart' || c.suit === 'diamond').length
      : 0;

    this.cardDisplay.clearCenterCards();
    sortHand(playerHand);
    this.cardDisplay.renderPlayerHand();
    this.host.updatePatternHint();

    const onPlayCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0]!,
      pattern,
      target: 'enemy',
      // 是否为响应（跟牌）出牌：韩世忠「忠武」等技能据此判定
      isRespond: prevPhase === 'player_respond',
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      centerCardContainers: this.host.centerCards,
      playedCards,
    };

    if (animatedCards.length === 0) {
      await this.host.skillEventBus.emit(SkillTiming.ON_PLAY, onPlayCtx);
      await this.handlePostPlayEmptyHandCheck(playerHand, pattern);
      return;
    }

    const positions = this.cardDisplay.getCardFanPositions(animatedCards.length, 1200, 475);
    await this.cardDisplay.animateCardsToPositionsAsync(animatedCards, positions, 120);

    for (const card of animatedCards) {
      const labelText = card.getData('consideredAsLabel') as string | undefined;
      if (labelText) {
        const halfW = CARD_W / 2;
        const halfH = CARD_H / 2;
        const tagBg = this.host.add.graphics();
        const tagW = 128;
        const tagH = 32;
        const tagX = -halfW + 4;
        const tagY = halfH - tagH - 4;
        tagBg.fillStyle(0xfaf5eb, 0.85);
        tagBg.fillRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
        tagBg.lineStyle(1, 0x8a6030, 0.6);
        tagBg.strokeRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
        const tagText = this.host.add.text(0, tagH / 2, labelText, {
          fontSize: '24px',
          fontFamily: FONT_FAMILY,
          fontStyle: 'bold',
          color: '#4a2a08',
          stroke: '#faf5eb',
          strokeThickness: 2,
        }).setOrigin(0.5);
        const tagContainer = this.host.add.container(tagX, tagY).setDepth(DEPTH_CENTER_BASE + 200);
        tagContainer.add([tagBg, tagText]);
        card.add(tagContainer);
        card.setData('_consideredTag', tagContainer);
      }
    }

    this.host.centerCards = animatedCards;
    this.host.centerCardsOwner = 'player';

    this.cardDisplay.showPatternLabel(
      HAND_TYPE_LABELS[pattern.type],
      pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
    );

    onPlayCtx.centerCardContainers = this.host.centerCards;
    await this.host.skillEventBus.emit(SkillTiming.ON_PLAY, onPlayCtx);

    await this.handlePostPlayEmptyHandCheck(playerHand, pattern);
  }

  async handlePostPlayEmptyHandCheck(hand: Card[], pattern: HandPattern): Promise<void> {
    if (hand.length === 0) {
      // 出完牌直接结算：对方没有响应机会，关羽「武圣」不触发
      this.host.battle.player.pendingRedCount = 0;
      await this.damageSettlement.playDamageSettlement(pattern, 'enemy', true);
      // 玩家打光手牌：减灶效果周期结束（打出最后一手当次的结算仍在 active 内，故复位须在结算之后）
      this.host.battle.jianzaoActive = false;
      // 圈结束：清空这一圈敌方打出的牌记录
      this.host.battle.roundEnemyCards = [];
      if (this.host.battle.enemy.vitality <= 0) {
        this.showGameOver(true);
        return;
      }
      this.host.battle.lastPlay = null;
      await this.refillIfEmpty('player');
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.battle.turnHolder = 'enemy';
      this.host.phase = 'ai_init';
      this.host.resetActiveSkillUses();
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      await this.aiInitiatePlay();
      return;
    }

    await waitForDelay(this.scene, 300);
    this.host.phase = 'ai_respond';
    this.host.updateUIForPhase();
    this.host.respondChainDepth = this.host.respondChainDepth + 1;
    await this.aiRespond();
  }

  async executePass(who: 'player' | 'enemy'): Promise<void> {
    this.host.phase = 'animating';

    await this.showPassAnimation(who);
    VoiceManager.play(this.scene, getRandomPassVoice(), who);

    // 玩家选择不出后：广播 ON_PASS（触发吕不韦「居奇」等「不出后」类技能）
    if (who === 'player') {
      await this.emitPlayerPass();
    }

    if (!this.host.battle.lastPlay) {
      // 新一轮开局（无人出牌）：无待结算牌，清掉遗留的武圣判定依据
      this.host.battle.player.pendingRedCount = 0;
      if (who === 'player') {
        this.host.battle.turnHolder = 'enemy';
        this.host.phase = 'ai_init';
        this.host.resetActiveSkillUses();
        this.host.updateUIForPhase();
        this.host.respondChainDepth = 0;
        await this.aiInitiatePlay();
      } else {
        // 对方无牌可出（新一轮开局），玩家获得牌权：重置「每次获得牌权限一次」类主动技次数
        this.host.battle.turnHolder = 'player';
        await this.emitPlayerGainTurn();
        this.host.phase = 'player_init';
        this.host.initActiveSkills();
        this.host.resetActiveSkillUses('gain-turn');
        await this.refillIfEmpty('player');
        this.host.updateUIForPhase();
        this.host.respondChainDepth = 0;
      }
      return;
    }

    const lastPlay = this.host.battle.lastPlay;

    if (who === 'player') {
      // 玩家不出：结算敌方牌，武圣判定依据不再有效
      this.host.battle.player.pendingRedCount = 0;
      this.host.battle.turnHolder = 'enemy';
      this.cardDisplay.renderPlayerHand();
      this.host.updatePatternHint();

      await this.damageSettlement.playDamageSettlement(lastPlay, 'player', false);
      // 张飞「断喝」型取消（cancelDamageSettlement(true) 已把牌权给玩家）→ 直接返回；
      // 荆轲「匕现」反杀（敌方被反伤击败，phase 已为 game_over）→ 同样直接返回；
      // 庄周「逍遥」型取消（cancelDamageSettlement(false) 仅无效伤害）→ 继续走正常结算后流程（敌方继续出牌）
      const cancelledPhase = this.host.phase as GamePhase;
      if (this.host.damageSettlementCancelled
        && (cancelledPhase === 'player_init' || cancelledPhase === 'game_over')) return;
      if (this.host.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      // 玩家不出结算完成：一圈结束，清空这一圈敌方打出的牌记录
      this.host.battle.roundEnemyCards = [];
      this.host.battle.lastPlay = null;
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.phase = 'ai_init';
      this.host.resetActiveSkillUses();
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      await this.aiInitiatePlay();
    } else {
      this.host.battle.turnHolder = 'player';

      await this.damageSettlement.playDamageSettlement(lastPlay, 'enemy', false);
      if (this.host.battle.enemy.vitality <= 0) {
        this.showGameOver(true);
        return;
      }
      // 敌方选择不出、伤害结算完成：广播 ON_ENEMY_PASS
      // （姜尚「垂钓」读取这一圈敌方打出的牌；必须在清空 roundEnemyCards 之前）
      const enemyPassCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0] ?? 'player',
        pattern: lastPlay,
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
        roundEnemyCards: this.host.battle.roundEnemyCards,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_ENEMY_PASS, enemyPassCtx);
      // 一圈结束：清空这一圈敌方打出的牌记录（须在 ON_ENEMY_PASS emit 之后）
      this.host.battle.roundEnemyCards = [];
      this.host.battle.lastPlay = null;
      await this.cardDisplay.fadeOutCenterCardsAsync();
      // 敌方不出，玩家获得牌权：广播 ON_GAIN_TURN（如赵高「指鹿」）；重置获得牌权型主动技次数
      await this.emitPlayerGainTurn();
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      this.host.resetActiveSkillUses('gain-turn');
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
    }
  }

  /**
   * 玩家获得牌权：广播 ON_GAIN_TURN（触发「获得牌权时」类技能，如赵高「指鹿」）。
   * 与敌方清空手牌路径（aiRespond/aiInitiatePlay 中）的广播保持一致的 context。
   */
  private async emitPlayerGainTurn(): Promise<void> {
    // 周瑜「反间」标记过期：玩家获得牌权即失效（「到你下次获得牌权之前」语义）。
    // 仅玩家获得牌权时清空；敌方获得牌权（aiInitiatePlay 中 sourceCharacterId 为
    // 敌方的 ON_GAIN_TURN）不清。
    this.host.battle.fanjianMarkedUid = undefined;
    // 徐达「镇北」封锁本圈结束：玩家获得牌权后失效，下一圈对方恢复正常响应
    this.host.battle.xudaResponseBlock = false;
    // 李离「尊法」本圈禁花色结束：上一圈已结束（任意一方接不住牌受伤），
    // 旧禁花色先失效；下方 emit ON_GAIN_TURN 时「尊法」若触发会重新写入新禁花色
    // （敌方无手牌 / 李离不在阵容时不触发 → 旧禁花色保持清除，不会误禁新圈）。
    this.host.battle.liliZunfaSuit = undefined;
    const gainTurnCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0] ?? 'player',
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);
  }

  /**
   * 玩家选择不出：广播 ON_PASS（触发「不出后」类技能，如吕不韦「居奇」）。
   */
  private async emitPlayerPass(): Promise<void> {
    const passCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0] ?? 'player',
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_PASS, passCtx);
  }

  showPassAnimation(who: 'player' | 'enemy'): Promise<void> {
    const { width, height } = this.host.scale;
    const posY = who === 'player' ? height - 90 : 220;

    const passText = this.host.add.text(width / 2, posY, '过', {
      fontSize: '108px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#5a3000',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT).setAlpha(0);

    passText.setShadow(0, 0, '#ff8800', 18, true, true);

    return waitForTween(this.scene, {
      targets: passText,
      alpha: 1,
      duration: 80,
      ease: 'Sine.easeOut',
    }).then(() =>
      waitForTween(this.scene, {
        targets: passText,
        scaleX: { from: 0, to: 1 },
        duration: 400,
        yoyo: true,
        ease: 'Sine.easeInOut',
      }).then(() => passText.destroy()),
    );
  }

  private refillHand(target: 'player' | 'enemy'): void {
    const state = target === 'player' ? this.host.battle.player : this.host.battle.enemy;
    const needed = 17 - state.hand.length;
    if (needed <= 0) return;

    if (state.deck.length < needed) {
      const remaining = state.deck.splice(0);
      state.deck = shuffleDeck(state.discardPile);
      state.discardPile = [];
      state.deck.push(...remaining);
    }

    const drawn = state.deck.splice(0, needed);
    state.hand.push(...drawn);
    sortHand(state.hand);
  }

  refillPlayerHand(): void {
    this.refillHand('player');
  }

  refillEnemyHand(): void {
    this.refillHand('enemy');
  }

  /**
   * 摸满玩家手牌（公共事件）：玩家手牌为空时补满至上限、渲染入场动画，
   * 并广播 ON_HAND_REFILLED（孙膑「减灶」、姜尚「辅王」等「摸满手牌后」技能响应）。
   *
   * 所有「玩家摸满手牌」路径统一走此方法：
   * - 获得牌权补满（refillIfEmpty）
   * - 主动技弃空手牌（ActiveSkillManager.onSkillClick）
   * - 海瑞「谏疏」弃空手牌（HaiRuiJianShu）
   */
  async refillPlayerHandAndNotify(): Promise<void> {
    if (this.host.battle.player.hand.length === 0) {
      this.refillPlayerHand();
      this.cardDisplay.renderPlayerHand(true);
      const refillCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0] ?? 'player',
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_HAND_REFILLED, refillCtx);
    }
  }

  async refillIfEmpty(who: 'player' | 'enemy'): Promise<void> {
    if (who === 'player') {
      await this.refillPlayerHandAndNotify();
      return;
    }
    if (this.host.battle.enemy.hand.length === 0) {
      this.refillEnemyHand();
      await this.cardDisplay.renderEnemyHandAsync(300);
    }
  }

  /**
   * 周瑜「反间」劫持：敌方刚打出的整手牌（playedCards）中包含被标记的牌时，
   * 以敌方打出的整手牌对敌方结算伤害（视为周瑜打出），结算完成后周瑜获得牌权。
   *
   * - 触发条件：battle.fanjianMarkedUid 存在 && playedCards 中某张 uid === 标记 uid；
   * - 以敌方刚打出的整手牌 pattern 对敌方结算（target === 'enemy'，玩家阵容伤害
   *   加成技能如减灶/性善因 target === 'enemy' 自然正常触发，无需额外处理）；
   * - 敌方已打出的牌（enemy.discardPile / roundEnemyCards）保持现有逻辑不变
   *   （牌已打出不撤回）；被劫持后本圈直接结束（玩家此前打出的牌被反间覆盖，
   *   lastPlay 置空、桌面清空）；
   * - 结算被取消（damageSettlementCancelled && phase 为 'player_init'/'game_over'）
   *   → 尊重取消语义直接返回；敌方被反间伤害击败 → showGameOver(true)；
   * - 收尾统一走 emitPlayerGainTurn()（触发「获得牌权时」类技能），不手写重复广播。
   *
   * @returns true 表示本次敌方出牌已被劫持，调用方应直接返回。
   */
  private async tryFanjianHijack(playedCards: Card[], pattern: HandPattern): Promise<boolean> {
    const markedUid = this.host.battle.fanjianMarkedUid;
    if (!markedUid) return false;
    if (!playedCards.some(c => c.uid === markedUid)) return false;

    // a. 以敌方刚打出的整手牌对敌方结算（视为周瑜打出）
    await this.damageSettlement.playDamageSettlement(pattern, 'enemy', true);
    // b. 标记已触发，清空
    this.host.battle.fanjianMarkedUid = undefined;

    // c. 结算被取消（如张飞「断喝」已把牌权给玩家、荆轲「匕现」反杀 phase 为 game_over）
    //    → 尊重取消语义直接返回
    if (this.host.damageSettlementCancelled
      && (this.host.phase === 'player_init' || this.host.phase === 'game_over')) return true;

    if (this.host.battle.enemy.vitality <= 0) {
      this.showGameOver(true);
      return true;
    }

    // d. 敌方已打出的牌保持现有逻辑不变（不撤回）；反间覆盖本圈：
    //    清空这一圈敌方打出的牌记录与桌面，本圈直接结束
    this.host.battle.roundEnemyCards = [];
    this.host.battle.lastPlay = null;
    await this.cardDisplay.fadeOutCenterCardsAsync();

    // 周瑜获得牌权：广播 ON_GAIN_TURN（触发「获得牌权时」类技能，含反间标记
    // 过期清空）并走标准获得牌权收尾
    await this.emitPlayerGainTurn();
    this.host.battle.turnHolder = 'player';
    this.host.phase = 'player_init';
    this.host.initActiveSkills();
    this.host.resetActiveSkillUses('gain-turn');
    await this.refillIfEmpty('player');
    this.host.updateUIForPhase();
    this.host.respondChainDepth = 0;
    return true;
  }

  /**
   * 李离「尊法」本圈禁花色：敌方本圈不能打出被禁花色的牌。
   * 返回 [suit]（liliZunfaSuit 非空时），供 decidePlay 的 blockedSuits 过滤；
   * 无禁花色返回 []。本圈结束后玩家再次获得牌权时尊法重触发刷新花色。
   */
  private getLiliZunfaBlockedSuits(): Card['suit'][] {
    const suit = this.host.battle.liliZunfaSuit;
    return suit ? [suit] : [];
  }

  async aiRespond(): Promise<void> {
    await waitForDelay(this.scene, 300 + Math.random() * 300);
    this.host.battle.phase = 'respond';
    // 玩家侧被动技能封锁敌方响应（李白「诗仙」、包拯「铁断」等）：
    // 遍历玩家阵容全部角色 id 合并封锁类型，保证任意位置的玩家角色技能都生效
    const blockedResponseTypes = [
      ...new Set(
        this.host.playerCharacterIds.flatMap(id =>
          getBlockedResponseTypes(id, this.host.battle.lastPlay),
        ),
      ),
    ];
    // 徐达「镇北」封锁：玩家响应过对方打出的牌后，对方本圈无法再响应 →
    // 直接走现有 pass 流程（复用 executePass，不自写 pass 动画）
    if (this.host.battle.xudaResponseBlock) {
      await this.executePass('enemy');
      return;
    }
    const cards = decidePlay(this.host.battle, (plays, ctx) => {
      const enemyCharId = this.host.battle.enemyCharacterId;
      if (!enemyCharId) return;
      const enemySkills = this.host.skillRunner.getRegistry().getSkillsByCharacter(enemyCharId);
      for (const skill of enemySkills) {
        skill.onAIDecision?.(plays, ctx);
      }
    }, blockedResponseTypes, this.getLiliZunfaBlockedSuits());
    if (!cards || cards.length === 0) {
      await waitForDelay(this.scene, 200 + Math.random() * 300);
      await this.executePass('enemy');
      return;
    }

    const pattern = identifyHand(cards)!;
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      await waitForDelay(this.scene, 500);
    }
    GameAudioManager.playSfx(this.scene, 'sfx_play_card');
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      GameAudioManager.playSfx(this.scene, 'sfx_bomb');
    }

    const isBombOnNonBomb = this.host.respondChainDepth > 0 &&
      (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) &&
      this.host.battle.lastPlay !== null &&
      this.host.battle.lastPlay.type !== HandType.Bomb &&
      this.host.battle.lastPlay.type !== HandType.Rocket;
    const voiceKey = getVoiceKeyForPlay(pattern, false, isBombOnNonBomb);
    VoiceManager.play(this.scene, voiceKey, 'enemy');

    const enemyHand = this.host.battle.enemy.hand;
    const indicesToRemove = this.findCardIndices(enemyHand, cards);

    const displayCards = this.cardDisplay.createEnemyDisplayCards(indicesToRemove);

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      const ei = enemyHand[i]!; playedCards.push({ ...ei });
    }
    for (const i of indicesToRemove) {
      enemyHand.splice(i, 1);
    }
    this.host.battle.enemy.discardPile.push(...playedCards);
    // 记录敌方这一圈打出的牌（姜尚「垂钓」结算时读取，含临时牌由技能侧过滤）
    this.host.battle.roundEnemyCards.push(...playedCards);
    sortHand(enemyHand);

    this.host.battle.lastPlay = pattern;
    this.host.battle.turnHolder = 'enemy';

    this.cardDisplay.renderEnemyHand();
    this.host.updateTurnIndicator('enemy');

    const playerCenterCards = [...this.host.centerCards];

    const pos = this.cardDisplay.getCardFanPositions(displayCards.length, 1380, 475);
    await this.cardDisplay.animateCardsToPositionsAsync(displayCards, pos, 120);

    // 周瑜「反间」劫持点：敌方打出的整手牌包含被标记的牌时，以敌方整手牌对敌方
    // 结算（视为周瑜打出），结算完成后周瑜获得牌权，本圈直接结束
    this.host.centerCards = displayCards;
    this.host.centerCardsOwner = 'enemy';
    if (await this.tryFanjianHijack(playedCards, pattern)) return;

    if (enemyHand.length === 0) {
      this.host.centerCards = [...displayCards];
      this.host.centerCardsOwner = 'enemy';

      this.cardDisplay.showPatternLabel(
        HAND_TYPE_LABELS[pattern.type],
        pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
      );

      const aiOnPlayCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: this.host.battle.enemyCharacterId ?? 'unknown',
        pattern,
        target: 'player',
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
        centerCardContainers: this.host.centerCards,
        playedCards,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_PLAY, aiOnPlayCtx);

      // 敌方出完牌直接结算：玩家非主动出牌，武圣判定依据清零
      this.host.battle.player.pendingRedCount = 0;
      await this.damageSettlement.playDamageSettlement(pattern, 'player', true);
      // 张飞「断喝」型取消（已把牌权给玩家）→ 直接返回；荆轲「匕现」反杀（phase 为 game_over）→ 直接返回；
      // 庄周「逍遥」型取消（仅无效伤害）→ 继续正常结算后流程
      if (this.host.damageSettlementCancelled
        && (this.host.phase === 'player_init' || this.host.phase === 'game_over')) return;
      if (this.host.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.host.battle.lastPlay = null;
      // 敌方打光手牌直接结算：圈结束清空这一圈敌方打出的牌记录
      this.host.battle.roundEnemyCards = [];
      this.refillEnemyHand();

      // 敌方出完牌，玩家获得牌权：广播 ON_GAIN_TURN（含反间标记过期清空）
      await this.emitPlayerGainTurn();

      await this.cardDisplay.renderEnemyHandAsync(300);
      await this.cardDisplay.animateShiftAndReplaceAsync(playerCenterCards, displayCards, 150);
      this.host.centerCards = displayCards;
      this.host.centerCardsOwner = 'enemy';

      this.cardDisplay.showPatternLabel(
        HAND_TYPE_LABELS[pattern.type],
        pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
      );

      await waitForDelay(this.scene, 100);
      await this.cardDisplay.fadeOutCenterCardsAsync();
      // 敌方出完牌，玩家获得牌权：重置「每次获得牌权限一次」类主动技次数
      this.host.battle.turnHolder = 'player';
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      this.host.resetActiveSkillUses('gain-turn');
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      return;
    }

    await waitForDelay(this.scene, 600);
    await this.cardDisplay.animateShiftAndReplaceAsync(playerCenterCards, displayCards, 150);
    this.host.centerCards = displayCards;
    this.host.centerCardsOwner = 'enemy';

    this.cardDisplay.showPatternLabel(
      HAND_TYPE_LABELS[pattern.type],
      pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
    );

    const aiOnPlayCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: this.host.battle.enemyCharacterId ?? 'unknown',
      pattern,
      target: 'player',
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      centerCardContainers: this.host.centerCards,
      playedCards,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_PLAY, aiOnPlayCtx);

    this.host.phase = 'player_respond';
    this.host.updateUIForPhase();
    this.host.respondChainDepth = this.host.respondChainDepth + 1;
  }

  async aiInitiatePlay(): Promise<void> {
    const enemyWasEmpty = this.host.battle.enemy.hand.length === 0;
    await this.refillIfEmpty('enemy');
    if (enemyWasEmpty) {
      const gainTurnCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: this.host.battle.enemyCharacterId ?? 'enemy',
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);
    }
    this.host.respondChainDepth = 0;
    const turnStartCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: this.host.battle.enemyCharacterId ?? 'unknown',
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_TURN_START, turnStartCtx);

    await waitForDelay(this.scene, 300 + Math.random() * 300);
    this.host.battle.phase = 'play';
    const cards = decidePlay(this.host.battle, (plays, ctx) => {
      const enemyCharId = this.host.battle.enemyCharacterId;
      if (!enemyCharId) return;
      const enemySkills = this.host.skillRunner.getRegistry().getSkillsByCharacter(enemyCharId);
      for (const skill of enemySkills) {
        skill.onAIDecision?.(plays, ctx);
      }
    }, undefined, this.getLiliZunfaBlockedSuits());
    if (!cards || cards.length === 0) {
      this.host.battle.lastPlay = null;
      this.host.battle.turnHolder = 'player';
      // AI 无牌可出，玩家获得牌权：广播 ON_GAIN_TURN（如赵高「指鹿」）；重置获得牌权型主动技次数
      await this.emitPlayerGainTurn();
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      this.host.resetActiveSkillUses('gain-turn');
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      return;
    }

    const pattern = identifyHand(cards)!;
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      await waitForDelay(this.scene, 500);
    }
    GameAudioManager.playSfx(this.scene, 'sfx_play_card');
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      GameAudioManager.playSfx(this.scene, 'sfx_bomb');
    }

    const voiceKey = getVoiceKeyForPlay(pattern, true, false);
    VoiceManager.play(this.scene, voiceKey, 'enemy');

    const enemyHand = this.host.battle.enemy.hand;
    const indicesToRemove = this.findCardIndices(enemyHand, cards);

    const displayCards = this.cardDisplay.createEnemyDisplayCards(indicesToRemove);

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      const ei = enemyHand[i]!; playedCards.push({ ...ei });
    }
    for (const i of indicesToRemove) {
      enemyHand.splice(i, 1);
    }
    this.host.battle.enemy.discardPile.push(...playedCards);
    // 记录敌方这一圈打出的牌（姜尚「垂钓」结算时读取，含临时牌由技能侧过滤）
    this.host.battle.roundEnemyCards.push(...playedCards);
    sortHand(enemyHand);

    this.host.battle.lastPlay = pattern;
    this.host.battle.turnHolder = 'enemy';

    this.cardDisplay.clearCenterCards();
    this.cardDisplay.renderEnemyHand();
    this.host.updateTurnIndicator('enemy');

    const pos = this.cardDisplay.getCardFanPositions(displayCards.length, 1200, 475);
    await this.cardDisplay.animateCardsToPositionsAsync(displayCards, pos, 120);
    this.host.centerCards = displayCards;
    this.host.centerCardsOwner = 'enemy';

    // 周瑜「反间」劫持点：敌方打出的整手牌包含被标记的牌时，以敌方整手牌对敌方
    // 结算（视为周瑜打出），结算完成后周瑜获得牌权，本圈直接结束
    if (await this.tryFanjianHijack(playedCards, pattern)) return;

    this.cardDisplay.showPatternLabel(
      HAND_TYPE_LABELS[pattern.type],
      pattern.type === HandType.Bomb || pattern.type === HandType.Rocket,
    );

    const aiOnPlayCtx: SkillContext = {
      gameScene: this.scene,
      battle: this.host.battle,
      sourceCharacterId: this.host.battle.enemyCharacterId ?? 'unknown',
      pattern,
      target: 'player',
      playerCharacterIds: this.host.playerCharacterIds,
      enemyCharacterId: this.host.battle.enemyCharacterId,
      centerCardContainers: this.host.centerCards,
      playedCards,
    };
    await this.host.skillEventBus.emit(SkillTiming.ON_PLAY, aiOnPlayCtx);

    if (enemyHand.length === 0) {
      // 敌方出完牌直接结算：玩家非主动出牌，武圣判定依据清零
      this.host.battle.player.pendingRedCount = 0;
      await this.damageSettlement.playDamageSettlement(pattern, 'player', true);
      // 张飞「断喝」型取消（已把牌权给玩家）→ 直接返回；荆轲「匕现」反杀（phase 为 game_over）→ 直接返回；
      // 庄周「逍遥」型取消（仅无效伤害）→ 继续正常结算后流程
      if (this.host.damageSettlementCancelled
        && (this.host.phase === 'player_init' || this.host.phase === 'game_over')) return;
      if (this.host.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.host.battle.lastPlay = null;
      // 敌方打光手牌直接结算：圈结束清空这一圈敌方打出的牌记录
      this.host.battle.roundEnemyCards = [];
      // 只补牌不播动画（动画由下方 renderEnemyHandAsync 统一播放一次，
      // 2026-08-16 修复：此前用 refillIfEmpty 内部已播一次动画导致补牌动画执行两次）
      this.refillEnemyHand();

      // 敌方出完牌，玩家获得牌权：广播 ON_GAIN_TURN（含反间标记过期清空）
      await this.emitPlayerGainTurn();

      await this.cardDisplay.renderEnemyHandAsync(300);
      await this.cardDisplay.fadeOutCenterCardsAsync();
      // 敌方出完牌，玩家获得牌权：重置「每次获得牌权限一次」类主动技次数
      this.host.battle.turnHolder = 'player';
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      this.host.resetActiveSkillUses('gain-turn');
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      return;
    }

    await waitForDelay(this.scene, 300);
    this.host.phase = 'player_respond';
    this.host.updateUIForPhase();
  }

  findCardIndices(hand: Card[], cards: Card[]): number[] {
    const used = new Set<number>();
    const result: number[] = [];
    for (const card of cards) {
      for (let i = 0; i < hand.length; i++) {
        if (!used.has(i) && hand[i]!.uid === card.uid) {
          used.add(i);
          result.push(i);
          break;
        }
      }
    }
    return result.sort((a, b) => b - a);
  }

  showGameOver(playerWin: boolean): void {
    this.host.phase = 'game_over';
    this.stopBattleBgm();

    if (playerWin) {
      const settings = loadAudioSettings();
      const victory = this.scene.sound.add('victory_jingle', { volume: settings.sfxVolume });
      GameAudioManager.track(this.scene, victory);
      victory.play();
    } else {
      GameAudioManager.playBgm(this.scene, 'bgm_failure', { loop: false });
    }

    const { width, height } = this.scene.scale;
    const overlay = this.scene.add.graphics();
    overlay.setDepth(DEPTH_OVERLAY);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);

    const resultText = playerWin ? '胜利' : '败北';
    const resultColor = playerWin ? '#6a4a20' : '#802020';

    const title = this.scene.add.text(width / 2, height / 2 - 50, resultText, {
      fontSize: '92px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: resultColor,
      stroke: '#fff6e0',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.scene.tweens.add({
      targets: title,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 400,
      ease: 'Back.easeOut',
    });

    const runMode = this.host.battleConfig?.runMode;
    if (runMode) {
      this.showRunModeResult(playerWin, runMode);
      return;
    }
    if (this.host.isTestMode) {
      this.showTestModeResult();
      return;
    }

    // 兜底路径：菜单直进的裸战斗，保持原有行为
    this.scene.add.text(width / 2, height / 2 + 30, '点击返回主菜单', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#f0e0c0',
      stroke: '#1a0800',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.scene.time.delayedCall(500, () => {
      this.scene.input.once('pointerdown', () => {
        this.scene.cameras.main.fadeOut(400, 0, 0, 0);
        this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.scene.start('MenuScene');
        });
      });
    });
  }

  /**
   * 局外循环终局：写回 RunManager（含落盘），显示收益/损失，
   * 点击后按对局状态跳转 MapScene 或 RunEndScene。
   */
  private showRunModeResult(playerWin: boolean, runMode: RunModeConfig): void {
    const { width, height } = this.scene.scale;
    let subText: string;
    let nextSceneKey: string;
    let nextSceneData: { victory: boolean } | undefined;

    // 战斗内角色状态写回对局（跨战斗保留）：
    // 1) 角色标记（如蓝玉「骜」）累计保存，下次战斗继续生效；
    // 2) 战斗中失去的角色牌（如蓝玉桀骜反噬）永久移出阵容
    //    （黄金台可重新招募），其标记一并清零；
    // 3) 角色技能跨战斗状态（如周处「除害」移除大小王进度、是否已获得「励心」）合并写回；
    // 4) 本场战斗中玩家获得自对方的牌（如周处「除害」获得的红桃）进入玩家牌库，
    //    下场战斗发牌时会融合进玩家牌组。
    const pendingRun = getRun();
    // 强盗「剪径」：被强盗击败后随机抢夺玩家牌库三张牌（永久失去）的提示文本；
    // 玩家击败强盗（playerWin）时保持 null，无事发生
    let plunderNotice: string | null = null;
    if (pendingRun) {
      const markers = { ...pendingRun.characterMarkers };
      markers.lanyu = this.host.battle.player.aoMarkers ?? 0;
      // 战斗中失去的角色牌（蓝玉「桀骜」反噬、海瑞「谏疏」移除等）永久移出阵容，
      // 黄金台可重新招募；蓝玉的「骜」标记一并清零
      const lost = this.host.battle.player.lostCharacters ?? [];
      if (lost.length > 0) {
        pendingRun.roster = pendingRun.roster.filter(id => !lost.includes(id));
      }
      if (lost.includes('lanyu')) {
        markers.lanyu = 0;
      }
      pendingRun.characterMarkers = markers;

      // 技能状态写回（合并；周处转换后【除害】不再注册、【励心】生效均由此持久化）
      const skillFlags = { ...pendingRun.characterSkillFlags };
      Object.assign(skillFlags, this.host.battle.player.skillFlags ?? {});
      pendingRun.characterSkillFlags = skillFlags;

      // 田文「养士」：本场战斗累计的卡牌分数加成合并写回（跨对局继承）。
      // 每次获得牌权触发技能时已在战斗内累加（battle.player.scoreBoosts），
      // 这里与存档中的历史加成合并，下场战斗 initBattle 时重新应用。
      const scoreBoosts = this.host.battle.player.scoreBoosts ?? {};
      if (Object.keys(scoreBoosts).length > 0) {
        const mergedBoosts = { ...pendingRun.scoreBoosts };
        for (const [key, value] of Object.entries(scoreBoosts)) {
          mergedBoosts[key] = (mergedBoosts[key] ?? 0) + value;
        }
        pendingRun.scoreBoosts = mergedBoosts;
      }

      // 写回 cardPool 的牌扣除本场养士加成：这些牌若被养士 buff 过（进手牌后
      // 获得牌权、或被劫海劫走），score 快照已含加成；而 scoreBoosts 会在下场
      // 战斗 initBattle 统一应用到牌组，若不扣除会「快照加成 + 再次应用」重复叠加。
      // 扣除后 cardPool 存的是「历史加成后的原始分」，加成统一交给 scoreBoosts 应用。
      const stripScoreBoosts = (cards: Card[]): Card[] =>
        cards.map(c => {
          const boost = scoreBoosts[cardScoreBoostKey(c)] ?? 0;
          return boost > 0 ? { ...c, score: c.score - boost } : { ...c };
        });

      // 获得的牌进入玩家牌库（复制对象，避免与战斗内引用共享）。
      // 仅写回战斗结束时仍持于玩家手牌的获得牌：被打出/弃置的获得牌按牌库规则
      // 「弃置不影响牌库」战斗结束清空；被对方抢回的牌同样不再进入玩家牌库。
      const acquired = this.host.battle.player.acquiredCards ?? [];
      if (acquired.length > 0) {
        const handUids = new Set(this.host.battle.player.hand.map(c => c.uid));
        const stillHeld = acquired.filter(c => handUids.has(c.uid));
        if (stillHeld.length > 0) {
          pendingRun.cardPool = [
            ...pendingRun.cardPool,
            ...stripScoreBoosts(stillHeld),
          ];
        }
      }

      // 倭寇「劫海」：被劫走的牌在敌方被击败（玩家胜利）后无条件全量回归玩家牌库。
      // 与 acquiredCards「仅仍持于手牌」不同，劫海牌无论是否仍被敌方持有都写回
      // （深拷贝，避免与战斗内引用共享）。
      if (playerWin) {
        const stolen = this.host.battle.wokouStolenCards ?? [];
        if (stolen.length > 0) {
          pendingRun.cardPool = [
            ...pendingRun.cardPool,
            ...stripScoreBoosts(stolen),
          ];
        }
      }

      // 强盗「剪径」：被强盗击败后，随机抢夺玩家牌库三张牌（永久失去）。
      // 直接 splice 掉 run.cardPool 中的牌，本次 save 落盘；玩家击败强盗则不触发。
      if (!playerWin && runMode.enemyId === 'qiangdao') {
        const plundered = plunderRandomCardsFromPool(pendingRun.cardPool, 3);
        if (plundered.length > 0) {
          plunderNotice = `被洗劫：牌库 -${plundered.length} 张`;
        }
      }

      // 角色状态先落盘一次：即使后续 applyBattleResult 因节点缺失返回 null
      // （异常路径），"失去角色牌/标记"也已持久化，不会因未保存而回滚。
      save();
    }

    if (playerWin) {
      // 事件节点的战斗胜利按普通战斗发放通宝
      const rewardType: NodeType = runMode.nodeType === 'event' ? 'normal' : runMode.nodeType;
      const reward = tongbaoReward(rewardType, Math.random);
      const run = applyBattleResult({ nodeId: runMode.nodeId, victory: true, reward });
      const interest = consumePendingInterest();
      subText = interest > 0 ? `通宝 +${reward} · 利息 +${interest}` : `通宝 +${reward}`;

      // 天火同人：战斗节点（normal/elite/boss）胜利回天命，弹提示
      const destinyUp = run ? triggerDestinyUpOnBattleWin(run, runMode.nodeType) : null;
      if (destinyUp) {
        subText = `${subText} · ${destinyUp}`;
        save();
      }

      if (run && isRunComplete(run)) {
        nextSceneKey = 'RunEndScene';
        nextSceneData = { victory: true };
      } else {
        nextSceneKey = 'MapScene';
      }
    } else {
      const enemy = this.host.battle.enemy;
      const percent = enemy.vitalityMax > 0
        ? Math.round((enemy.vitality / enemy.vitalityMax) * 100)
        : 0;
      const destinyLoss = calcDestinyLoss(percent, runMode.nodeType === 'boss');
      const run = applyBattleResult({ nodeId: runMode.nodeId, victory: false, enemyVitalityPercent: percent });
      subText = plunderNotice ? `天命 -${destinyLoss} · ${plunderNotice}` : `天命 -${destinyLoss}`;
      if (run && isRunOver(run)) {
        nextSceneKey = 'RunEndScene';
        nextSceneData = { victory: false };
      } else {
        nextSceneKey = 'MapScene';
      }
    }

    this.scene.add.text(width / 2, height / 2 + 30, subText, {
      fontSize: '38px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffdf80',
      stroke: '#1a0800',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.scene.add.text(width / 2, height / 2 + 90, '点击继续', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#f0e0c0',
      stroke: '#1a0800',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.scene.time.delayedCall(500, () => {
      this.scene.input.once('pointerdown', () => {
        this.scene.cameras.main.fadeOut(400, 0, 0, 0);
        this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.scene.start(nextSceneKey, nextSceneData);
        });
      });
    });
  }

  /** 测试模式终局：提供「再来一局」（同配置重开）与「返回主菜单」 */
  private showTestModeResult(): void {
    const { width, height } = this.scene.scale;
    const btnTextStyle = {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffdf90',
      stroke: '#2a1008',
      strokeThickness: 3,
    };

    UIFactory.button(this.scene, width / 2 - 190, height / 2 + 70, '↻', '再来一局', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.scene.scene.restart(this.host.battleConfig ?? undefined);
    }, { w: 300, h: 64, textStyle: btnTextStyle }).setDepth(DEPTH_OVERLAY_TEXT);

    UIFactory.button(this.scene, width / 2 + 190, height / 2 + 70, '⌂', '返回主菜单', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.scene.cameras.main.fadeOut(400, 0, 0, 0);
      this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.scene.start('MenuScene');
      });
    }, { w: 300, h: 64, textStyle: btnTextStyle }).setDepth(DEPTH_OVERLAY_TEXT);
  }
}
