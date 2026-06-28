import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { shuffleDeck, sortHand, sortPlayedCards } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { identifyHand } from '../../engine/HandRecognizer';
import { decidePlay } from '../../engine/AIBrain';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { VoiceManager, getVoiceKeyForPlay, getRandomPassVoice } from '../../utils/VoiceManager';
import type { PlayerCharacterId } from '../../models/Character';

import { canPlayerBeat } from '../../engine/CharacterAbilities';
import { SkillTiming } from '../../skills';
import type { SkillContext, SkillEventBus, SkillRunner } from '../../skills';
import { getBlockedResponseTypes } from '../../skills/PassiveSkillUtils';
import { waitForDelay, waitForTween } from '../../utils/AnimationUtils';
import type { CardDisplayManager } from './CardDisplayManager';
import type { DamageSettlementManager } from './DamageSettlementManager';
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
      const canBeatPlay = canPlayerBeat(
        this.host.battle.player.characterId,
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
        const tagW = 120;
        const tagH = 26;
        const tagX = -halfW + 4;
        const tagY = halfH - tagH - 4;
        tagBg.fillStyle(0xfaf5eb, 0.85);
        tagBg.fillRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
        tagBg.lineStyle(1, 0x8a6030, 0.6);
        tagBg.strokeRoundedRect(-tagW / 2, 0, tagW, tagH, 5);
        const tagText = this.host.add.text(0, tagH / 2, labelText, {
          fontSize: '20px',
          fontFamily: FONT_FAMILY,
          color: '#5a3a20',
        }).setOrigin(0.5);
        const tagContainer = this.host.add.container(tagX, tagY).setDepth(DEPTH_CENTER_BASE + 200);
        tagContainer.add([tagBg, tagText]);
        card.add(tagContainer);
        card.setData('_consideredTag', tagContainer);
      }
    }

    this.host.centerCards = animatedCards;
    this.host.centerCardsOwner = 'player';

    onPlayCtx.centerCardContainers = this.host.centerCards;
    await this.host.skillEventBus.emit(SkillTiming.ON_PLAY, onPlayCtx);

    await this.handlePostPlayEmptyHandCheck(playerHand, pattern);
  }

  async handlePostPlayEmptyHandCheck(hand: Card[], pattern: HandPattern): Promise<void> {
    if (hand.length === 0) {
      await this.damageSettlement.playDamageSettlement(pattern, 'enemy', true);
      if (this.host.battle.enemy.vitality <= 0) {
        this.showGameOver(true);
        return;
      }
      this.host.battle.lastPlay = null;
      await this.refillIfEmpty('player');
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.battle.turnHolder = 'enemy';
      this.host.phase = 'ai_init';
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

    if (!this.host.battle.lastPlay) {
      if (who === 'player') {
        this.host.battle.turnHolder = 'enemy';
        this.host.phase = 'ai_init';
        this.host.updateUIForPhase();
        this.host.respondChainDepth = 0;
        await this.aiInitiatePlay();
      } else {
        this.host.battle.turnHolder = 'player';
        this.host.phase = 'player_init';
        this.host.initActiveSkills();
        await this.refillIfEmpty('player');
        this.host.updateUIForPhase();
        this.host.respondChainDepth = 0;
      }
      return;
    }

    const lastPlay = this.host.battle.lastPlay;

    if (who === 'player') {
      this.host.battle.turnHolder = 'enemy';
      this.cardDisplay.renderPlayerHand();
      this.host.updatePatternHint();

      await this.damageSettlement.playDamageSettlement(lastPlay, 'player', false);
      if (this.host.damageSettlementCancelled) return;
      if (this.host.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.host.battle.lastPlay = null;
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.phase = 'ai_init';
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
      this.host.battle.lastPlay = null;
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
    }
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

  async refillIfEmpty(who: 'player' | 'enemy'): Promise<void> {
    if (who === 'player') {
      if (this.host.battle.player.hand.length === 0) {
        this.refillPlayerHand();
        this.cardDisplay.renderPlayerHand(true);
      }
      return;
    }
    if (this.host.battle.enemy.hand.length === 0) {
      this.refillEnemyHand();
      await this.cardDisplay.renderEnemyHandAsync(300);
    }
  }

  async aiRespond(): Promise<void> {
    await waitForDelay(this.scene, 400);
    this.host.battle.phase = 'respond';
    const cards = decidePlay(this.host.battle);
    if (!cards || cards.length === 0) {
      await this.executePass('enemy');
      return;
    }

    const pattern = identifyHand(cards)!;
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
    sortHand(enemyHand);

    this.host.battle.lastPlay = pattern;
    this.host.battle.turnHolder = 'enemy';

    this.cardDisplay.renderEnemyHand();
    this.host.updateTurnIndicator('enemy');

    const playerCenterCards = [...this.host.centerCards];

    const pos = this.cardDisplay.getCardFanPositions(displayCards.length, 1380, 475);
    await this.cardDisplay.animateCardsToPositionsAsync(displayCards, pos, 120);

    if (enemyHand.length === 0) {
      this.host.centerCards = [...displayCards];
      this.host.centerCardsOwner = 'enemy';

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

      await this.damageSettlement.playDamageSettlement(pattern, 'player', true);
      if (this.host.damageSettlementCancelled) return;
      if (this.host.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.host.battle.lastPlay = null;
      this.refillEnemyHand();

      const gainTurnCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0] ?? 'player',
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);

      await this.cardDisplay.renderEnemyHandAsync(300);
      await this.cardDisplay.animateShiftAndReplaceAsync(playerCenterCards, displayCards, 150);
      this.host.centerCards = displayCards;
      this.host.centerCardsOwner = 'enemy';
      await waitForDelay(this.scene, 100);
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.battle.turnHolder = 'player';
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      this.host.respondChainDepth = 0;
      return;
    }

    await waitForDelay(this.scene, 600);
    await this.cardDisplay.animateShiftAndReplaceAsync(playerCenterCards, displayCards, 150);
    this.host.centerCards = displayCards;
    this.host.centerCardsOwner = 'enemy';

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

    await waitForDelay(this.scene, 400);
    this.host.battle.phase = 'play';
    const cards = decidePlay(this.host.battle);
    if (!cards || cards.length === 0) {
      this.host.battle.lastPlay = null;
      this.host.battle.turnHolder = 'player';
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
      await this.refillIfEmpty('player');
      this.host.updateUIForPhase();
      return;
    }

    const pattern = identifyHand(cards)!;
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
      await this.damageSettlement.playDamageSettlement(pattern, 'player', true);
      if (this.host.damageSettlementCancelled) return;
      if (this.host.battle.player.vitality <= 0) {
        this.showGameOver(false);
        return;
      }
      this.host.battle.lastPlay = null;
      await this.refillIfEmpty('enemy');

      const gainTurnCtx: SkillContext = {
        gameScene: this.scene,
        battle: this.host.battle,
        sourceCharacterId: this.host.battle.player.characterId ?? this.host.playerCharacterIds[0] ?? 'player',
        playerCharacterIds: this.host.playerCharacterIds,
        enemyCharacterId: this.host.battle.enemyCharacterId,
      };
      await this.host.skillEventBus.emit(SkillTiming.ON_GAIN_TURN, gainTurnCtx);

      await this.cardDisplay.renderEnemyHandAsync(300);
      await this.cardDisplay.fadeOutCenterCardsAsync();
      this.host.battle.turnHolder = 'player';
      this.host.phase = 'player_init';
      this.host.initActiveSkills();
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
      fontSize: '80px',
      fontFamily: FONT_FAMILY,
      color: resultColor,
      stroke: '#f0ebe0',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.scene.add.text(width / 2, height / 2 + 30, '点击返回主菜单', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#8a7a60',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.scene.tweens.add({
      targets: title,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 400,
      ease: 'Back.easeOut',
    });

    this.scene.time.delayedCall(500, () => {
      this.scene.input.once('pointerdown', () => {
        this.scene.cameras.main.fadeOut(400, 0, 0, 0);
        this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.scene.start('MenuScene');
        });
      });
    });
  }
}
