import Phaser from 'phaser';
import { Card, createDeck, shuffleDeck, cardDisplayName, sortHand } from '../models/Card';
import { BattleState, HandPattern, HandType, HAND_TYPE_LABELS } from '../models/BattleTypes';
import { identifyHand, canBeat, findAllPlays, findBeatingPlays } from '../engine/HandRecognizer';
import { calculateDamage, calculateDamageWithEmptyHand, getCoefficient } from '../engine/DamageCalculator';
import { decidePlay } from '../engine/AIBrain';
import { loadAudioSettings, saveAudioSettings } from '../AudioSettings';
import { AudioManager } from '../utils/AudioManager';

const FONT_FAMILY = '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif';
const CARD_W = 180;
const CARD_H = 252;
const SELECTED_OFFSET = -40;

const DEPTH_BG = -10;
const DEPTH_BG_BORDER = -5;
const DEPTH_UI = 500;
const DEPTH_ENEMY_HAND = 1;
const DEPTH_PLAYER_HAND = 30;
const DEPTH_CENTER_BASE = 100;
const DEPTH_DAMAGE = 450;
const DEPTH_OVERLAY = 900;
const DEPTH_OVERLAY_TEXT = 1000;

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

function sortPlayedCards(cards: Card[]): Card[] {
  const rankCounts = new Map<number, number>();
  for (const c of cards) {
    rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
  }

  const suitOrder: Record<string, number> = { spade: 0, club: 1, heart: 2, diamond: 3 };

  return [...cards].sort((a, b) => {
    const countA = rankCounts.get(a.rank)!;
    const countB = rankCounts.get(b.rank)!;

    if (countA !== countB) return countB - countA;
    if (a.rank !== b.rank) return a.rank - b.rank;

    const suitA = a.suit ? (suitOrder[a.suit] ?? 4) : 4;
    const suitB = b.suit ? (suitOrder[b.suit] ?? 4) : 4;
    return suitA - suitB;
  });
}

export class GameScene extends Phaser.Scene {
  private battle!: BattleState;
  private phase: GamePhase = 'player_init';

  private selectedIndices: Set<number> = new Set();
  private cardObjects: Phaser.GameObjects.Container[] = [];
  private enemyCardObjects: Phaser.GameObjects.Container[] = [];

  private playerVitalityBar!: Phaser.GameObjects.Graphics;
  private enemyVitalityBar!: Phaser.GameObjects.Graphics;
  private playerVitalityText!: Phaser.GameObjects.Text;
  private enemyVitalityText!: Phaser.GameObjects.Text;
  private playerDeckText!: Phaser.GameObjects.Text;
  private enemyDeckText!: Phaser.GameObjects.Text;
  private patternHintText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private thinkingText!: Phaser.GameObjects.Text;
  private btnPlay!: Phaser.GameObjects.Container;
  private btnPass!: Phaser.GameObjects.Container;
  private btnPlayText!: Phaser.GameObjects.Text;
  private btnPassText!: Phaser.GameObjects.Text;

  private enemyNameText!: Phaser.GameObjects.Text;
  private playerNameText!: Phaser.GameObjects.Text;

  private cardHandGroup!: Phaser.GameObjects.Container;
  private aiHandGroup!: Phaser.GameObjects.Container;

  private centerCards: Phaser.GameObjects.Container[] = [];
  private centerCardsOwner: 'player' | 'enemy' | null = null;
  private centerDepthCounter = DEPTH_CENTER_BASE;



  private battleBgm: Phaser.Sound.BaseSound | null = null;
  private battleBgmKeys = ['bgm_battle_1', 'bgm_battle_2', 'bgm_battle_3', 'bgm_battle_4'];
  private currentBattleBgmIndex = -1;

  private handPatternButton!: Phaser.GameObjects.Container;
  private handPatternModal: Phaser.GameObjects.Container | null = null;

  private settingsButton!: Phaser.GameObjects.Container;
  private settingsPanel: Phaser.GameObjects.Container | null = null;
  private volumeSettingsModal: Phaser.GameObjects.Container | null = null;
  private returnConfirmModal: Phaser.GameObjects.Container | null = null;

  private dragStartIndex: number | null = null;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragActive: boolean = false;
  private dragSelectMode: 'add' | 'remove' | null = null;
  private dragTouchedIndices: Set<number> = new Set();
  private dragSnapshot: Set<number> = new Set();

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.phase = 'player_init';
    this.selectedIndices = new Set();
    this.cardObjects = [];
    this.enemyCardObjects = [];
    this.centerCards = [];
    this.centerCardsOwner = null;
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);
    this.createInfoBars(width, height);
    this.createButtons(width, height);
    this.createPatternHint(width, height);
    this.createTurnIndicator(width, height);
    this.createHandPatternButton(width, height);
    this.createSettingsButton(width, height);

    this.battle = this.initBattle();

    this.renderAllCards();
    this.setupHandInput();
    this.updateVitalityBars();
    this.updateUIForPhase();

    AudioManager.init(this);
    AudioManager.unlock(this);

    this.time.delayedCall(200, () => {
      AudioManager.playSfx(this, 'sfx_gong');
      this.time.delayedCall(800, () => {
        this.initBattleBgm();
      });
    });
  }

  private initBattle(): BattleState {
    const playerDeck = shuffleDeck(createDeck());
    const enemyDeck = shuffleDeck(createDeck());

    const playerHand = playerDeck.splice(0, 17);
    const enemyHand = enemyDeck.splice(0, 17);

    sortHand(playerHand);
    sortHand(enemyHand);

    return {
      player: {
        hand: playerHand,
        deck: playerDeck,
        discardPile: [],
        vitality: 500,
        vitalityMax: 500,
        name: '玩家',
      },
      enemy: {
        hand: enemyHand,
        deck: enemyDeck,
        discardPile: [],
        vitality: 500,
        vitalityMax: 500,
        name: '山贼头目',
      },
      turnHolder: 'player',
      lastPlay: null,
      phase: 'play',
      turnCount: 1,
    };
  }

  // ═══════════════════════════════════════════════
  //  UI Drawing
  // ═══════════════════════════════════════════════

  private drawBackground(w: number, h: number): void {
    const bg = this.add.image(w / 2, h / 2, 'battle_bg');
    bg.setDepth(DEPTH_BG);
    const scaleX = w / bg.width;
    const scaleY = h / bg.height;
    bg.setScale(Math.max(scaleX, scaleY));

    const border = this.add.graphics();
    border.setDepth(DEPTH_BG_BORDER);
    border.lineStyle(1, 0x6a4a2a, 0.3);
    border.strokeRect(8, 8, w - 16, h - 16);
  }

  private createInfoBars(w: number, _h: number): void {
    // Enemy info bar (top)
    const enemyBarY = 50;
    const enemyBarX = 120;
    const barW = 420;
    const barH = 34;

    this.enemyNameText = this.add.text(enemyBarX, enemyBarY - 16, '山贼头目', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setDepth(DEPTH_UI);

    const enemyBg = this.add.graphics();
    enemyBg.setDepth(DEPTH_UI);
    enemyBg.fillStyle(0xf0ebe0, 0.85);
    enemyBg.fillRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);
    enemyBg.lineStyle(1, 0x9a8a6a, 0.6);
    enemyBg.strokeRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);

    this.enemyVitalityBar = this.add.graphics();
    this.enemyVitalityBar.setDepth(DEPTH_UI);
    this.enemyVitalityText = this.add.text(enemyBarX + barW / 2, enemyBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    // 玩家信息栏（中下方，高于按钮和手牌）
    const playerBarY = _h - 380;

    this.playerNameText = this.add.text(enemyBarX, playerBarY - 16, '玩家', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setDepth(DEPTH_UI);

    const playerBg = this.add.graphics();
    playerBg.setDepth(DEPTH_UI);
    playerBg.fillStyle(0xf0ebe0, 0.85);
    playerBg.fillRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);
    playerBg.lineStyle(1, 0x9a8a6a, 0.6);
    playerBg.strokeRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);

    this.playerVitalityBar = this.add.graphics();
    this.playerVitalityBar.setDepth(DEPTH_UI);
    this.playerVitalityText = this.add.text(enemyBarX + barW / 2, playerBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    const deckTextX = enemyBarX + barW + 24;
    this.enemyDeckText = this.add.text(deckTextX, enemyBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI);

    this.playerDeckText = this.add.text(deckTextX, playerBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI);

  }

  private createButtons(w: number, h: number): void {
    const btnY = h - 320;
    const btnW = 250;
    const btnH = 80;

    // Play button
    this.btnPlay = this.add.container(w / 2 - 160, btnY).setDepth(DEPTH_UI);
    const playBg = this.add.graphics();
    playBg.fillStyle(0xc8a878, 1);
    playBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    playBg.lineStyle(1.5, 0x8a6030, 0.85);
    playBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.btnPlay.add(playBg);

    this.btnPlayText = this.add.text(0, 0, '出  牌', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#1a0a04',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnPlay.add(this.btnPlayText);

    const playZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    playZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.onPlayClick();
    });
    this.btnPlay.add(playZone);

    // Pass button
    this.btnPass = this.add.container(w / 2 + 160, btnY).setDepth(DEPTH_UI);
    const passBg = this.add.graphics();
    passBg.fillStyle(0xe8dcc8, 1);
    passBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    passBg.lineStyle(1, 0xb8a888, 0.6);
    passBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.btnPass.add(passBg);

    this.btnPassText = this.add.text(0, 0, '不  出', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#7a6a50',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnPass.add(this.btnPassText);

    const passZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    passZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.onPassClick();
    });
    this.btnPass.add(passZone);
  }

  private createPatternHint(w: number, h: number): void {
    this.patternHintText = this.add.text(w / 2, h - 370, '', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0.5).setDepth(DEPTH_UI);
  }

  private createTurnIndicator(w: number, _h: number): void {
    this.turnIndicatorText = this.add.text(w / 2, 100, '', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
      stroke: '#f0ebe0',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    this.thinkingText = this.add.text(590, 67, '', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
      stroke: '#f0ebe0',
      strokeThickness: 1,
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI).setVisible(false);
  }

  // ═══════════════════════════════════════════════
  //  Card Rendering
  // ═══════════════════════════════════════════════

  private createCardDisplay(card: Card, x: number, y: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const halfW = CARD_W / 2;
    const halfH = CARD_H / 2;

    const shadowG = this.add.graphics();
    container.add(shadowG);
    container.setData('_shadowG', shadowG);

    if (isSelected) {
      shadowG.fillStyle(0xffd700, 0.30);
      shadowG.fillRoundedRect(-halfW - 4, -halfH - 4, CARD_W + 8, CARD_H + 8, 10);
      shadowG.fillStyle(0xffd700, 0.18);
      shadowG.fillRoundedRect(-halfW - 9, -halfH - 9, CARD_W + 18, CARD_H + 18, 12);
      shadowG.fillStyle(0xffd700, 0.09);
      shadowG.fillRoundedRect(-halfW - 15, -halfH - 15, CARD_W + 30, CARD_H + 30, 14);
    } else {
      shadowG.fillStyle(0x1a0a04, 0.25);
      shadowG.fillRoundedRect(-halfW + 5, -halfH + 6, CARD_W, CARD_H, 8);
    }

    const isRed = card.suit === 'heart' || card.suit === 'diamond';
    const textColor = isRed ? '#b02828' : '#1a0a04';
    const isJoker = card.rank >= 25;

    const suitSymbol: Record<string, string> = {
      spade: '♠', club: '♣', heart: '♥', diamond: '♦',
    };

    const g = this.add.graphics();

    // Card background
    g.fillStyle(0xfaf5eb, 1);
    g.fillRoundedRect(-halfW, -halfH, CARD_W, CARD_H, 8);

    // Outer border — double line
    g.lineStyle(2.5, 0x6b4e2b, 0.85);
    g.strokeRoundedRect(-halfW + 3, -halfH + 3, CARD_W - 6, CARD_H - 6, 7);
    g.lineStyle(1, 0xb8963e, 0.5);
    g.strokeRoundedRect(-halfW + 8, -halfH + 8, CARD_W - 16, CARD_H - 16, 6);

    // Corner ornaments — diamond shapes at four corners
    const cornerM = 16;
    const cornerSz = 8;
    const corners: Array<[number, number]> = [
      [-halfW + cornerM, -halfH + cornerM],
      [ halfW - cornerM, -halfH + cornerM],
      [-halfW + cornerM,  halfH - cornerM],
      [ halfW - cornerM,  halfH - cornerM],
    ];

    g.fillStyle(0xb8963e, 0.35);
    for (const [cx, cy] of corners) {
      g.fillPoints([
        new Phaser.Math.Vector2(cx, cy - cornerSz),
        new Phaser.Math.Vector2(cx + cornerSz, cy),
        new Phaser.Math.Vector2(cx, cy + cornerSz),
        new Phaser.Math.Vector2(cx - cornerSz, cy),
      ], true);
    }

    // Decorative dots along inner border edges (one dot every 30px)
    g.fillStyle(0xb8963e, 0.25);
    const step = 28;
    for (let t = halfH - 30; t >= -halfH + 30; t -= step) {
      g.fillCircle(-halfW + 18, t, 2);
      g.fillCircle( halfW - 18, t, 2);
    }
    for (let l = halfW - 30; l >= -halfW + 30; l -= step) {
      g.fillCircle(l, -halfH + 18, 2);
      g.fillCircle(l,  halfH - 18, 2);
    }

    // Central medallion — rotated square frame
    const midSize = 36;
    g.lineStyle(1.2, 0xb8963e, 0.25);
    const midPoints = [
      new Phaser.Math.Vector2(0, -midSize - 8),
      new Phaser.Math.Vector2(midSize + 8, 0),
      new Phaser.Math.Vector2(0, midSize + 8),
      new Phaser.Math.Vector2(-midSize - 8, 0),
    ];
    g.strokePoints(midPoints, true);

    // Small circle inside medallion
    g.lineStyle(1, 0xb8963e, 0.2);
    g.strokeCircle(0, 0, 14);

    container.add(g);

    // ═══ Top-left corner: rank + suit ═══
    const cornerX = -halfW + 16;
    const cornerY = -halfH + 10;

    if (!isJoker) {
      const rankTxt = this.add.text(cornerX, cornerY, card.rankLabel, {
        fontSize: '34px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0, 0);
      container.add(rankTxt);

      const suitTxt = this.add.text(cornerX, cornerY + 34, suitSymbol[card.suit!], {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0, 0);
      container.add(suitTxt);

      // Large faded suit symbol in center
      const centerSuit = this.add.text(0, 0, suitSymbol[card.suit!], {
        fontSize: '60px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0.5).setAlpha(0.12);
      container.add(centerSuit);
    }

    // ═══ Joker rendering ═══
    if (isJoker) {
      const jokerColor = card.rank === 30 ? '#c9a030' : '#1a0a04';

      const cornerLabel = this.add.text(cornerX, cornerY, card.rankLabel, {
        fontSize: '30px',
        fontFamily: FONT_FAMILY,
        color: jokerColor,
      }).setOrigin(0, 0);
      container.add(cornerLabel);

      const patternName = card.rank === 30 ? 'card_pattern_dragon' : 'card_pattern_tiger';
      const pattern = this.add.image(0, 0, patternName);
      const maxPatternW = CARD_W * 0.7;
      const maxPatternH = CARD_H * 0.7;
      const scale = Math.min(maxPatternW / pattern.width, maxPatternH / pattern.height);
      if (scale < 1) {
        pattern.setScale(scale);
      }
      container.add(pattern);

      const label = this.add.text(0, halfH - 22, 'JOKER', {
        fontSize: '13px',
        fontFamily: FONT_FAMILY,
        color: '#8a6830',
      }).setOrigin(0.5);
      container.add(label);
    }

    container.setData('rank', card.rank);

    return container;
  }

  private updateCardShadowGlow(container: Phaser.GameObjects.Container, isGlow: boolean): void {
    const shadowG = container.getData('_shadowG') as Phaser.GameObjects.Graphics | undefined;
    if (!shadowG) return;
    shadowG.clear();
    const halfW = CARD_W / 2;
    const halfH = CARD_H / 2;
    if (isGlow) {
      shadowG.fillStyle(0xffd700, 0.30);
      shadowG.fillRoundedRect(-halfW - 4, -halfH - 4, CARD_W + 8, CARD_H + 8, 10);
      shadowG.fillStyle(0xffd700, 0.18);
      shadowG.fillRoundedRect(-halfW - 9, -halfH - 9, CARD_W + 18, CARD_H + 18, 12);
      shadowG.fillStyle(0xffd700, 0.09);
      shadowG.fillRoundedRect(-halfW - 15, -halfH - 15, CARD_W + 30, CARD_H + 30, 14);
    } else {
      shadowG.fillStyle(0x1a0a04, 0.25);
      shadowG.fillRoundedRect(-halfW + 5, -halfH + 6, CARD_W, CARD_H, 8);
    }
  }

  private createCardInteractive(card: Card, x: number, y: number, index: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = this.createCardDisplay(card, x, y, isSelected);
    container.setDepth(DEPTH_PLAYER_HAND);
    container.setData('cardIndex', index);

    return container;
  }

  private renderAllCards(): void {
    this.renderPlayerHand();
    this.renderEnemyHand();
  }

  private renderPlayerHand(): void {
    this.cardObjects.forEach(c => c.destroy());
    this.cardObjects = [];

    const hand = this.battle.player.hand;
    const { width, height } = this.scale;
    const baseY = height - 90;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * overlapOffset;
      const isSelected = this.selectedIndices.has(i);
      const y = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const obj = this.createCardInteractive(hand[i], x, y, i, isSelected);
      obj.setDepth(DEPTH_PLAYER_HAND + i);
      this.cardObjects.push(obj);
    }
  }

  private renderEnemyHand(): void {
    this.enemyCardObjects.forEach(c => c.destroy());
    this.enemyCardObjects = [];

    const hand = this.battle.enemy.hand;
    const { width } = this.scale;
    const baseY = 220;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * overlapOffset;
      const container = this.add.container(x, baseY);
      container.setDepth(DEPTH_ENEMY_HAND + i);
      container.setData('cardIndex', i);

      const enemyShadowG = this.add.graphics();
      enemyShadowG.fillStyle(0x1a0a04, 0.25);
      enemyShadowG.fillRoundedRect(-CARD_W / 2 + 5, -CARD_H / 2 + 6, CARD_W, CARD_H, 8);
      container.add(enemyShadowG);

      const cardBack = this.add.image(0, 0, 'card_back');
      cardBack.setDisplaySize(CARD_W, CARD_H);
      container.add(cardBack);

      this.enemyCardObjects.push(container);
    }
  }

  private getCardFanPositions(count: number, centerX: number, centerY: number): Array<{ x: number; y: number }> {
    const gap = CARD_W * 0.75;
    const totalW = CARD_W + (count - 1) * gap;
    const startX = centerX - totalW / 2 + CARD_W / 2;
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      positions.push({ x: startX + i * gap, y: centerY });
    }
    return positions;
  }

  private animateCardsToPositions(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
    onComplete?: () => void
  ): void {
    if (cards.length === 0) {
      onComplete?.();
      return;
    }
    const baseDepth = this.centerDepthCounter;
    this.centerDepthCounter += cards.length;
    let completed = 0;
    for (let i = 0; i < cards.length; i++) {
      cards[i].setDepth(baseDepth + i);
      this.tweens.add({
        targets: cards[i],
        x: positions[i].x,
        y: positions[i].y,
        duration,
        ease: 'Sine.easeOut',
        onComplete: () => {
          completed++;
          if (completed >= cards.length) {
            onComplete?.();
          }
        },
      });
    }
  }

  private clearCenterCards(): void {
    for (const c of this.centerCards) {
      c.destroy();
    }
    this.centerCards = [];
    this.centerCardsOwner = null;
  }

  private fadeOutCenterCards(onComplete: () => void): void {
    const cards = [...this.centerCards];
    this.centerCards = [];
    this.centerCardsOwner = null;
    if (cards.length === 0) {
      onComplete();
      return;
    }
    let done = 0;
    for (const c of cards) {
      this.tweens.add({
        targets: c,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        y: c.y - 30,
        duration: 80,
        ease: 'Sine.easeIn',
        onComplete: () => {
          c.destroy();
          done++;
          if (done >= cards.length) onComplete();
        },
      });
    }
  }

  private animateShiftAndReplace(
    oldCards: Phaser.GameObjects.Container[],
    newCards: Phaser.GameObjects.Container[],
    duration: number,
    onComplete: () => void
  ): void {
    const total = oldCards.length + newCards.length;
    if (total === 0) {
      onComplete();
      return;
    }
    let completed = 0;
    const checkDone = () => {
      completed++;
      if (completed >= total) onComplete();
    };

    const shiftDepth = this.centerDepthCounter;
    this.centerDepthCounter += newCards.length + oldCards.length;

    for (const c of oldCards) {
      c.setDepth(shiftDepth + oldCards.indexOf(c));
      this.tweens.add({
        targets: c,
        x: c.x - 150,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        duration,
        ease: 'Sine.easeIn',
        onComplete: () => {
          c.destroy();
          checkDone();
        },
      });
    }

    const newPositions = this.getCardFanPositions(newCards.length, 1200, 475);
    for (let i = 0; i < newCards.length; i++) {
      newCards[i].setDepth(shiftDepth + oldCards.length + i);
      this.tweens.add({
        targets: newCards[i],
        x: newPositions[i].x,
        y: newPositions[i].y,
        duration,
        ease: 'Sine.easeOut',
        onComplete: checkDone,
      });
    }
  }

  private createEnemyDisplayCards(indices: number[]): Phaser.GameObjects.Container[] {
    const entries: Array<{ card: Card; x: number; y: number }> = [];

    for (const idx of indices) {
      if (idx < this.battle.enemy.hand.length) {
        const card = this.battle.enemy.hand[idx];
        let x: number;
        let y: number;
        if (idx < this.enemyCardObjects.length) {
          x = this.enemyCardObjects[idx].x;
          y = this.enemyCardObjects[idx].y;
        } else {
          const { width } = this.scale;
          const overlapOffset = CARD_W * 0.75;
          const totalW = CARD_W + (this.battle.enemy.hand.length - 1) * overlapOffset;
          const startX = (width - totalW) / 2 + CARD_W / 2;
          x = startX + idx * overlapOffset;
          y = 220;
        }
        entries.push({ card, x, y });
      }
    }

    const sortedCards = sortPlayedCards(entries.map(e => e.card));
    const cardToEntry = new Map<Card, typeof entries[0]>();
    for (const entry of entries) {
      cardToEntry.set(entry.card, entry);
    }

    const baseDepth = this.centerDepthCounter;
    this.centerDepthCounter += entries.length;
    const displayCards: Phaser.GameObjects.Container[] = [];
    for (const card of sortedCards) {
      const entry = cardToEntry.get(card);
      if (entry) {
        const display = this.createCardDisplay(card, entry.x, entry.y, false);
        display.setDepth(baseDepth + displayCards.length);
        displayCards.push(display);
        cardToEntry.delete(card);
      }
    }
    for (const entry of cardToEntry.values()) {
      const display = this.createCardDisplay(entry.card, entry.x, entry.y, false);
      display.setDepth(baseDepth + displayCards.length);
      displayCards.push(display);
    }

    return displayCards;
  }

  // ═══════════════════════════════════════════════
  //  Interaction
  // ═══════════════════════════════════════════════

  private onCardClick(index: number): void {
    if (this.phase === 'animating' || this.phase === 'game_over' || this.phase === 'ai_init' || this.phase === 'ai_respond') {
      return;
    }

    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }
    this.renderPlayerHand();
    this.updatePatternHint();
  }

  private getSelectedCards(): Card[] {
    return [...this.selectedIndices].sort((a, b) => a - b).map(i => this.battle.player.hand[i]);
  }

  private updatePatternHint(): void {
    const selected = this.getSelectedCards();
    if (selected.length === 0) {
      this.patternHintText.setText('');
      return;
    }

    const pattern = identifyHand(selected);
    if (!pattern) {
      this.patternHintText.setText('无效牌型');
      this.patternHintText.setColor('#a04040');
      return;
    }

    const label = HAND_TYPE_LABELS[pattern.type];
    const cardsStr = selected.map(c => cardDisplayName(c)).join('');

    if (this.battle.lastPlay && this.phase === 'player_respond') {
      if (!canBeat(pattern, this.battle.lastPlay)) {
        this.patternHintText.setText(`${label} ${cardsStr}（打不过上家）`);
        this.patternHintText.setColor('#a08040');
        return;
      }
    }

    this.patternHintText.setText(`${label}: ${cardsStr}`);
    this.patternHintText.setColor('#b89050');
  }

  private onPlayClick(): void {
    if (this.phase !== 'player_init' && this.phase !== 'player_respond') return;

    const selected = this.getSelectedCards();
    if (selected.length === 0) return;

    const pattern = identifyHand(selected);
    if (!pattern) return;

    if (this.phase === 'player_respond') {
      if (!this.battle.lastPlay || !canBeat(pattern, this.battle.lastPlay)) return;
    }

    AudioManager.playSfx(this, 'sfx_play_card');
    // Play bomb sound for bomb/rocket hands
    if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
      AudioManager.playSfx(this, 'sfx_bomb');
    }
    this.executePlay(selected, pattern);
  }

  private onPassClick(): void {
    if (this.phase !== 'player_respond') return;

    // Player gives up - take damage from enemy's last play
    this.executePass('player');
  }

  // ═══════════════════════════════════════════════
  //  Battle Logic
  // ═══════════════════════════════════════════════

  private executePlay(cards: Card[], pattern: HandPattern): void {
    this.phase = 'animating';

    const playerHand = this.battle.player.hand;
    const indicesToRemove = this.findCardIndices(playerHand, cards);

    const displayMap = new Map<string, Phaser.GameObjects.Container>();
    for (const idx of this.selectedIndices) {
      const cardObj = this.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        const handCard = playerHand[idx];
        const key = `${handCard.suit ?? 'joker'}-${handCard.rank}`;
        displayMap.set(key, cardObj);
        const arrIdx = this.cardObjects.indexOf(cardObj);
        if (arrIdx >= 0) this.cardObjects.splice(arrIdx, 1);
      }
    }

    this.selectedIndices.clear();

    const playedCards: Card[] = [];
    for (const i of indicesToRemove) {
      playedCards.push({ ...playerHand[i] });
    }
    for (const i of indicesToRemove) {
      playerHand.splice(i, 1);
    }
    this.battle.player.discardPile.push(...playedCards);

    const sortedPlayed = sortPlayedCards(playedCards);
    const animatedCards: Phaser.GameObjects.Container[] = [];
    for (const card of sortedPlayed) {
      const key = `${card.suit ?? 'joker'}-${card.rank}`;
      const display = displayMap.get(key);
      if (display) {
        animatedCards.push(display);
        displayMap.delete(key);
      }
    }
    for (const display of displayMap.values()) {
      animatedCards.push(display);
    }

    for (const card of animatedCards) {
      this.updateCardShadowGlow(card, false);
    }

    this.battle.lastPlay = pattern;
    this.battle.turnHolder = 'player';

    this.clearCenterCards();
    sortHand(playerHand);
    this.renderPlayerHand();
    this.updatePatternHint();

    if (animatedCards.length === 0) {
      this.handlePostPlayEmptyHandCheck(playerHand, pattern);
      return;
    }

    const positions = this.getCardFanPositions(animatedCards.length, 1200, 475);
    this.animateCardsToPositions(animatedCards, positions, 120, () => {
      this.centerCards = animatedCards;
      this.centerCardsOwner = 'player';

      if (playerHand.length === 0) {
        this.playDamageSettlement(pattern, 'enemy', true, () => {
          if (this.battle.enemy.vitality <= 0) {
            this.showGameOver(true);
            return;
          }
          this.battle.lastPlay = null;
          this.refillPlayerHand();
          this.renderPlayerHand();
          this.fadeOutCenterCards(() => {
            this.phase = 'player_init';
            this.updateUIForPhase();
          });
        });
        return;
      }

      this.time.delayedCall(300, () => {
        this.phase = 'ai_respond';
        this.updateUIForPhase();
        this.aiRespond();
      });
    });
  }

  private handlePostPlayEmptyHandCheck(hand: Card[], pattern: HandPattern): void {
    if (hand.length === 0) {
      this.playDamageSettlement(pattern, 'enemy', true, () => {
        if (this.battle.enemy.vitality <= 0) {
          this.showGameOver(true);
          return;
        }
        this.battle.lastPlay = null;
        this.refillPlayerHand();
        this.renderPlayerHand();
        this.fadeOutCenterCards(() => {
          this.phase = 'player_init';
          this.updateUIForPhase();
        });
      });
      return;
    }

    this.time.delayedCall(300, () => {
      this.phase = 'ai_respond';
      this.updateUIForPhase();
      this.aiRespond();
    });
  }

  private executePass(who: 'player' | 'enemy'): void {
    this.phase = 'animating';

    if (!this.battle.lastPlay) {
      if (who === 'player') {
        this.battle.turnHolder = 'enemy';
        this.phase = 'ai_init';
        this.updateUIForPhase();
        this.aiInitiatePlay();
      } else {
        this.battle.turnHolder = 'player';
        this.phase = 'player_init';
        this.updateUIForPhase();
      }
      return;
    }

    const lastPlay = this.battle.lastPlay;

    if (who === 'player') {
      this.battle.turnHolder = 'enemy';
      this.renderPlayerHand();
      this.updatePatternHint();

      this.playDamageSettlement(lastPlay, 'player', false, () => {
        if (this.battle.player.vitality <= 0) {
          this.showGameOver(false);
          return;
        }
        this.battle.lastPlay = null;
        this.fadeOutCenterCards(() => {
          this.phase = 'ai_init';
          this.updateUIForPhase();
          this.aiInitiatePlay();
        });
      });
    } else {
      this.battle.turnHolder = 'player';

      this.playDamageSettlement(lastPlay, 'enemy', false, () => {
        if (this.battle.enemy.vitality <= 0) {
          this.showGameOver(true);
          return;
        }
        this.battle.lastPlay = null;
        this.fadeOutCenterCards(() => {
          this.phase = 'player_init';
          this.updateUIForPhase();
        });
      });
    }
  }

  private refillPlayerHand(): void {
    const player = this.battle.player;
    const needed = 17 - player.hand.length;

    if (needed <= 0) return;

    if (player.deck.length < needed) {
      const remaining = player.deck.splice(0);
      player.deck = shuffleDeck(player.discardPile);
      player.discardPile = [];
      player.deck.push(...remaining);
    }

    const drawn = player.deck.splice(0, needed);
    player.hand.push(...drawn);
    sortHand(player.hand);
  }

  private refillEnemyHand(): void {
    const enemy = this.battle.enemy;
    const needed = 17 - enemy.hand.length;

    if (needed <= 0) return;

    if (enemy.deck.length < needed) {
      const remaining = enemy.deck.splice(0);
      enemy.deck = shuffleDeck(enemy.discardPile);
      enemy.discardPile = [];
      enemy.deck.push(...remaining);
    }

    const drawn = enemy.deck.splice(0, needed);
    enemy.hand.push(...drawn);
    sortHand(enemy.hand);
  }

  private aiRespond(): void {
    this.time.delayedCall(400, () => {
      this.battle.phase = 'respond';
      const cards = decidePlay(this.battle);
      if (!cards || cards.length === 0) {
        this.executePass('enemy');
        return;
      }

      const pattern = identifyHand(cards)!;
      AudioManager.playSfx(this, 'sfx_play_card');
      if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
        AudioManager.playSfx(this, 'sfx_bomb');
      }
      const enemyHand = this.battle.enemy.hand;
      const indicesToRemove = this.findCardIndices(enemyHand, cards);

      const displayCards = this.createEnemyDisplayCards(indicesToRemove);

      const playedCards: Card[] = [];
      for (const i of indicesToRemove) {
        playedCards.push({ ...enemyHand[i] });
      }
      for (const i of indicesToRemove) {
        enemyHand.splice(i, 1);
      }
      this.battle.enemy.discardPile.push(...playedCards);
      sortHand(enemyHand);

      this.battle.lastPlay = pattern;
      this.battle.turnHolder = 'enemy';

      this.renderEnemyHand();
      this.updateTurnIndicator('enemy');

      const playerCenterCards = [...this.centerCards];

      const pos = this.getCardFanPositions(displayCards.length, 1380, 475);
      this.animateCardsToPositions(displayCards, pos, 120, () => {
        if (enemyHand.length === 0) {
          this.centerCards = [...displayCards];
          this.centerCardsOwner = 'enemy';

          this.playDamageSettlement(pattern, 'player', true, () => {
            if (this.battle.player.vitality <= 0) {
              this.showGameOver(false);
              return;
            }
            this.battle.lastPlay = null;
            this.refillEnemyHand();
            this.renderEnemyHand();
            this.animateShiftAndReplace(playerCenterCards, displayCards, 150, () => {
              this.centerCards = displayCards;
              this.centerCardsOwner = 'enemy';
              this.time.delayedCall(100, () => {
                this.phase = 'ai_init';
                this.updateUIForPhase();
                this.aiInitiatePlay();
              });
            });
          });
          return;
        }

        this.time.delayedCall(600, () => {
          this.animateShiftAndReplace(playerCenterCards, displayCards, 150, () => {
            this.centerCards = displayCards;
            this.centerCardsOwner = 'enemy';
            this.phase = 'player_respond';
            this.updateUIForPhase();
          });
        });
      });
    });
  }

  private aiInitiatePlay(): void {
    this.time.delayedCall(400, () => {
      this.battle.phase = 'play';
      const cards = decidePlay(this.battle);
      if (!cards || cards.length === 0) {
        this.battle.lastPlay = null;
        this.battle.turnHolder = 'player';
        this.phase = 'player_init';
        this.updateUIForPhase();
        return;
      }

      const pattern = identifyHand(cards)!;
      AudioManager.playSfx(this, 'sfx_play_card');
      if (pattern.type === HandType.Bomb || pattern.type === HandType.Rocket) {
        AudioManager.playSfx(this, 'sfx_bomb');
      }
      const enemyHand = this.battle.enemy.hand;
      const indicesToRemove = this.findCardIndices(enemyHand, cards);

      const displayCards = this.createEnemyDisplayCards(indicesToRemove);

      const playedCards: Card[] = [];
      for (const i of indicesToRemove) {
        playedCards.push({ ...enemyHand[i] });
      }
      for (const i of indicesToRemove) {
        enemyHand.splice(i, 1);
      }
      this.battle.enemy.discardPile.push(...playedCards);
      sortHand(enemyHand);

      this.battle.lastPlay = pattern;
      this.battle.turnHolder = 'enemy';

      this.clearCenterCards();
      this.renderEnemyHand();
      this.updateTurnIndicator('enemy');

      const pos = this.getCardFanPositions(displayCards.length, 1200, 475);
      this.animateCardsToPositions(displayCards, pos, 120, () => {
        this.centerCards = displayCards;
        this.centerCardsOwner = 'enemy';

        if (enemyHand.length === 0) {
          this.playDamageSettlement(pattern, 'player', true, () => {
            if (this.battle.player.vitality <= 0) {
              this.showGameOver(false);
              return;
            }
            this.battle.lastPlay = null;
            this.refillEnemyHand();
            this.renderEnemyHand();
            this.fadeOutCenterCards(() => {
              this.phase = 'ai_init';
              this.updateUIForPhase();
              this.aiInitiatePlay();
            });
          });
          return;
        }

        this.time.delayedCall(300, () => {
          this.phase = 'player_respond';
          this.updateUIForPhase();
        });
      });
    });
  }

  private findCardIndices(hand: Card[], cards: Card[]): number[] {
    const used = new Set<number>();
    const result: number[] = [];
    for (const card of cards) {
      for (let i = 0; i < hand.length; i++) {
        if (!used.has(i) && hand[i].suit === card.suit && hand[i].rank === card.rank) {
          used.add(i);
          result.push(i);
          break;
        }
      }
    }
    return result.sort((a, b) => b - a);
  }

  // ═══════════════════════════════════════════════
  //  UI Updates
  // ═══════════════════════════════════════════════

  private updateUIForPhase(): void {
    const { width, height } = this.scale;

    switch (this.phase) {
      case 'player_init':
        if (this.playerHasPlayablePattern()) {
          this.turnIndicatorText.setText('你的回合：请出牌');
          this.turnIndicatorText.setPosition(width / 2, 100);
        } else {
          this.turnIndicatorText.setText('无牌可出，请选择不出');
          this.turnIndicatorText.setPosition(width / 2, height - 370);
        }
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(true);
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPassText.setColor('#8a7a5a');
        this.btnPass.setVisible(false);
        break;
      case 'player_respond':
        this.turnIndicatorText.setText('对方出牌，请接牌或放弃');
        this.turnIndicatorText.setPosition(width / 2, 100);
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(true);
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPass.setVisible(true);
        this.btnPassText.setColor('#1a0804');
        if (!this.playerHasPlayablePattern()) {
          this.turnIndicatorText.setText('无牌可接，请选择不出');
          this.turnIndicatorText.setPosition(width / 2, height - 370);
        }
        break;
      case 'ai_init':
        this.thinkingText.setText('对方正在思考...');
        this.thinkingText.setVisible(true);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        break;
      case 'ai_respond':
        this.thinkingText.setText('对方正在接牌...');
        this.thinkingText.setVisible(true);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#8a7a5a');
        break;
      case 'game_over':
        this.thinkingText.setVisible(false);
        this.turnIndicatorText.setVisible(false);
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        break;
      default:
        break;
    }
    this.renderEnemyHand();
    this.updateVitalityBars();
  }

  private updateTurnIndicator(who: 'player' | 'enemy'): void {
    const { width } = this.scale;
    if (who === 'player') {
      this.thinkingText.setVisible(false);
      this.turnIndicatorText.setVisible(true);
      this.turnIndicatorText.setText('你的回合：请出牌');
      this.turnIndicatorText.setPosition(width / 2, 100);
    } else {
      this.turnIndicatorText.setVisible(false);
      this.thinkingText.setText('对方正在思考...');
      this.thinkingText.setVisible(true);
    }
  }

  private updateVitalityBars(): void {
    const { height } = this.scale;
    const barX = 120;
    const barW = 420;
    const barH = 34;

    this.drawVitalityBar(
      this.enemyVitalityBar,
      this.enemyVitalityText,
      this.battle.enemy.vitality,
      this.battle.enemy.vitalityMax,
      barX, 56, barW, barH
    );
    this.drawVitalityBar(
      this.playerVitalityBar,
      this.playerVitalityText,
      this.battle.player.vitality,
      this.battle.player.vitalityMax,
      barX, height - 374, barW, barH
    );
    this.enemyDeckText.setText(`牌堆 ${this.battle.enemy.deck.length}`);
    this.playerDeckText.setText(`牌堆 ${this.battle.player.deck.length}`);
  }

  private drawVitalityBar(
    gfx: Phaser.GameObjects.Graphics,
    text: Phaser.GameObjects.Text,
    current: number,
    max: number,
    barX: number,
    barY: number,
    barW: number,
    barH: number
  ): void {
    gfx.clear();
    const ratio = Math.max(0, current / max);

    // Background
    gfx.fillStyle(0xe8dcc8, 0.8);
    gfx.fillRoundedRect(barX, barY, barW, barH, 4);

    // Fill
    let fillColor = 0x60a030;
    if (ratio < 0.3) fillColor = 0xa03030;
    else if (ratio < 0.6) fillColor = 0xc0a030;

    if (ratio > 0) {
      gfx.fillStyle(fillColor, 0.9);
      gfx.fillRoundedRect(barX + 1, barY + 1, (barW - 2) * ratio, barH - 2, 3);
    }

    // Border
    gfx.lineStyle(1, 0x9a8a6a, 0.6);
    gfx.strokeRoundedRect(barX, barY, barW, barH, 4);

    text.setText(`${current} / ${max}`);
    text.setPosition(barX + barW / 2, barY + barH / 2);
  }

  private animateHealthBarDepletion(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
    onComplete: () => void
  ): void {
    const battleObj = target === 'enemy' ? this.battle.enemy : this.battle.player;
    const oldVitality = battleObj.vitality;
    const vitObj = { value: oldVitality };

    this.tweens.add({
      targets: vitObj,
      value: newVitality,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        battleObj.vitality = Math.round(vitObj.value);
        this.updateVitalityBars();
      },
      onComplete: () => {
        battleObj.vitality = newVitality;
        this.updateVitalityBars();
        onComplete();
      },
    });
  }

  private playDamageSettlement(
    pattern: HandPattern,
    target: 'enemy' | 'player',
    isEmptyHand: boolean,
    onComplete: () => void
  ): void {
    this.phase = 'animating';

    const cards = [...this.centerCards];
    const sumRanks = pattern.cards.reduce((sum, c) => sum + c.rank, 0);
    const coefficient = getCoefficient(pattern.type, pattern.length);
    const finalDamage = isEmptyHand
      ? calculateDamageWithEmptyHand(pattern)
      : calculateDamage(pattern);

    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const counterText = this.add.text(centerX, centerY, '0', {
      fontSize: '72px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#cc3333',
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setShadow(0, 0, '#ff8800', 14, true, true);

    // ── Stage 1: 逐牌揭示（每卡 180ms 延迟 + 90ms 放大 + 90ms 缩回）──
    // 场中牌从左到右依次放大缩回，伤害计数器从 0 开始逐张累加 rank 值
    let currentSum = 0;
    const cardPhaseMs = cards.length > 0 ? cards.length * 360 + 180 : 0;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const rank = card.getData('rank') as number ?? 0;

      // Play reveal sound when each card starts enlarging
      this.time.delayedCall(i * 360, () => {
        AudioManager.playSfx(this, 'sfx_card_reveal');
      });

      // Floating "+x" score text on card
      this.time.delayedCall(i * 360 + 90, () => {
        const floatText = this.add.text(card.x, card.y, `+${rank}`, {
          fontSize: '36px',
          fontFamily: FONT_FAMILY,
          color: '#b08030',
          stroke: '#1a0800',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(DEPTH_DAMAGE + 1).setAlpha(0).setScale(0.5);

        this.tweens.add({
          targets: floatText,
          alpha: 1,
          scaleX: 1.15,
          scaleY: 1.15,
          y: floatText.y - 40,
          duration: 180,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: floatText,
              alpha: 0,
              y: floatText.y - 100,
              duration: 400,
              ease: 'Sine.easeIn',
              onComplete: () => floatText.destroy(),
            });
          },
        });
      });

      this.tweens.add({
        targets: card,
        scaleX: 1.25,
        scaleY: 1.25,
        duration: 180,
        delay: i * 360,
        ease: 'Sine.easeIn',
        onComplete: () => {
          currentSum += rank;
          counterText.setText(`${currentSum}`);

          this.tweens.add({
            targets: card,
            scaleX: 1,
            scaleY: 1,
            duration: 180,
            ease: 'Sine.easeOut',
          });
        },
      });
    }

    // ── Stage 2: 系数标签（600ms 渐入 + 900ms 保持）──
    // 计数器左移，右侧渐入"✖️ 系数（牌型）"；清空手牌时追加"✖️ 5（清空手牌）"
    this.time.delayedCall(cardPhaseMs, () => {
      this.tweens.add({
        targets: counterText,
        x: centerX - 50,
        duration: 600,
        ease: 'Sine.easeOut',
      });

      const typeLabel = HAND_TYPE_LABELS[pattern.type];
      const coeffText = this.add.text(centerX + 60, centerY,
        `✖️ ${coefficient}（${typeLabel}）`,
        {
          fontSize: '36px',
          fontFamily: FONT_FAMILY,
          color: '#8a5a20',
          stroke: '#1a0800',
          strokeThickness: 3,
        }
      ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0);

      this.tweens.add({
        targets: coeffText,
        alpha: 1,
        duration: 600,
        ease: 'Sine.easeOut',
      });

      let emptyHandText: Phaser.GameObjects.Text | null = null;
      if (isEmptyHand) {
        emptyHandText = this.add.text(
          coeffText.x + coeffText.width + 16,
          centerY,
          '✖️ 5（清空手牌）',
          {
            fontSize: '36px',
            fontFamily: FONT_FAMILY,
            color: '#cc6633',
            stroke: '#1a0800',
            strokeThickness: 3,
          }
      ).setOrigin(0, 0.5).setDepth(DEPTH_DAMAGE).setAlpha(0);

        this.tweens.add({
          targets: emptyHandText,
          alpha: 1,
          duration: 600,
          ease: 'Sine.easeOut',
        });
      }

      // ── Stage 3: 计数增长（标签 450ms 渐出 + 数字 600ms 增长到最终值）──
      this.time.delayedCall(900, () => {
        const labelsToFade: Phaser.GameObjects.Text[] = [coeffText];
        if (emptyHandText) labelsToFade.push(emptyHandText);

        for (const t of labelsToFade) {
          this.tweens.add({
            targets: t,
            alpha: 0,
            duration: 450,
            onComplete: () => t.destroy(),
          });
        }

        // 计数增长：伤害数字移动到画面中央，数值从 sumRanks 增长到最终伤害
        this.tweens.add({
          targets: counterText,
          x: centerX,
          y: centerY,
          duration: 600,
          ease: 'Sine.easeOut',
        });

        this.tweens.addCounter({
          from: sumRanks,
          to: finalDamage,
          duration: 600,
          ease: 'Cubic.easeOut',
          onUpdate: (tween) => {
            const val = tween.getValue();
            if (val !== null) {
              counterText.setText(`${Math.round(val)}`);
            }
          },
          onComplete: () => {
            AudioManager.playSfx(this, 'sfx_hurt');

            const barX = 120;
            const barW = 420;
            const barH = 34;
            const barTargetY = target === 'enemy' ? 56 : height - 374;
            const barCenterX = barX + barW / 2;
            const barCenterY = barTargetY + barH / 2;

            // 飞向血条：伤害数字飞向受伤方血条位置，同时放大
            this.tweens.add({
              targets: counterText,
              x: barCenterX,
              y: barCenterY,
              scaleX: 2.0,
              scaleY: 2.0,
              duration: 300,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                counterText.destroy();
                const battleObj = target === 'enemy' ? this.battle.enemy : this.battle.player;
                const newVitality = Math.max(0, battleObj.vitality - finalDamage);
                // 血条扣减：血量平滑过渡
                this.animateHealthBarDepletion(target, newVitality, 300, onComplete);
              },
            });
          },
        });
      });
    });
  }

  private showFloatingText(value: number, x: number, y: number, color: string): void {
    const text = this.add.text(x, y, `${value}`, {
      fontSize: '44px',
      fontFamily: FONT_FAMILY,
      color: color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE);

    this.tweens.add({
      targets: text,
      y: y - 90,
      alpha: { from: 1, to: 0 },
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private showGameOver(playerWin: boolean): void {
    this.phase = 'game_over';
    this.battleBgm?.stop();

    if (playerWin) {
      const settings = loadAudioSettings();
      const victory = this.sound.add('victory_jingle', { volume: settings.sfxVolume });
      AudioManager.track(this, victory);
      victory.play();
    } else {
      AudioManager.playBgm(this, 'bgm_failure', { loop: false });
    }

    const { width, height } = this.scale;
    const overlay = this.add.graphics();
    overlay.setDepth(DEPTH_OVERLAY);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);

    const resultText = playerWin ? '胜利' : '败北';
    const resultColor = playerWin ? '#6a4a20' : '#802020';

    const title = this.add.text(width / 2, height / 2 - 50, resultText, {
      fontSize: '80px',
      fontFamily: FONT_FAMILY,
      color: resultColor,
      stroke: '#f0ebe0',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    const hint = this.add.text(width / 2, height / 2 + 30, '点击返回主菜单', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#8a7a60',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);

    this.tweens.add({
      targets: title,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 400,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', () => {
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('MenuScene');
        });
      });
    });
  }

  private playerHasPlayablePattern(): boolean {
    const hand = this.battle.player.hand;
    if (this.phase === 'player_init') {
      const allPlays = findAllPlays(hand);
      return allPlays.length > 0;
    }
    if (this.phase === 'player_respond' && this.battle.lastPlay) {
      return findBeatingPlays(hand, this.battle.lastPlay).length > 0;
    }
    return false;
  }

  // ═══════════════════════════════════════════════
  //  Hand Pattern Button & Modal
  // ═══════════════════════════════════════════════

  private createHandPatternButton(w: number, _h: number): void {
    const btnX = w - 230;
    const btnY = 70;
    const btnW = 180;
    const btnH = 72;
    const radius = 16;

    const container = this.add.container(0, 0).setDepth(DEPTH_UI);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x1a0a04, 0.15);
    shadow.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 3, btnW, btnH, radius);
    container.add(shadow);

    const bg = this.add.graphics();
    const drawNormal = () => {
      bg.clear();
      bg.fillStyle(0xf0e8d4, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2, 0x8a6030, 0.8);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(1, 0xb8963e, 0.35);
      bg.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radius - 2);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0xd4c4a8, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2.5, 0x6a4020, 1);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(1.2, 0xb8963e, 0.5);
      bg.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radius - 2);
    };
    const drawPressed = () => {
      bg.clear();
      bg.fillStyle(0x9a8a6a, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2, 0x5a3018, 0.9);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
    };
    drawNormal();
    container.add(bg);

    const text = this.add.text(btnX, btnY, '牌型', {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5);
    container.add(text);

    const zone = this.add.zone(btnX, btnY, btnW, btnH).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => {
      drawHover();
    });
    zone.on('pointerout', () => {
      drawNormal();
    });
    zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      drawPressed();
      this.time.delayedCall(80, () => {
        drawNormal();
        this.showHandPatternModal();
      });
    });
    container.add(zone);

    this.handPatternButton = container;
  }

  private showHandPatternModal(): void {
    if (this.handPatternModal) return;

    const { width: sw, height: sh } = this.scale;
    const modalW = 880;
    const modalH = 920;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const pad = 24;
    const radius = 8;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.handPatternModal = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeHandPatternModal());
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(1, 0xa89878, 0.3);
    panel.strokeRoundedRect(modalX + 4, modalY + 4, modalW - 8, modalH - 8, radius - 1);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const titleY = modalY + 36;
    const title = this.add.text(modalX + modalW / 2, titleY, '牌型系数表', {
      fontSize: '42px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      stroke: '#e0d8c0',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const closeBtnX = modalX + modalW - 38;
    const closeBtnY = modalY + 22;
    const closeText = this.add.text(closeBtnX, closeBtnY, '✕', {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.add.zone(closeBtnX, closeBtnY, 52, 52).setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.closeHandPatternModal();
    });
    container.add([closeText, closeZone]);

    const col1X = modalX + pad + 6;
    const col2X = col1X + 160;
    const col3X = col1X + 410;
    const headerY = titleY + 38;
    const headerStyle = { fontSize: '34px', fontFamily: FONT_FAMILY, color: '#4a2a10' } as const;

    headerStyle satisfies Phaser.Types.GameObjects.Text.TextStyle;

    const headerBg = this.add.graphics();
    headerBg.fillStyle(0xe0d8c8, 0.6);
    headerBg.fillRect(modalX + pad, headerY - 8, modalW - pad * 2, 36);
    container.add(headerBg);

    container.add(this.add.text(col1X, headerY, '牌型', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    container.add(this.add.text(col2X, headerY, '系数', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    container.add(this.add.text(col3X, headerY, '说明', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xc8b898, 0.4);
    divider.lineBetween(modalX + pad, headerY + 14, modalX + modalW - pad, headerY + 14);
    container.add(divider);

    interface RowData {
      name: string;
      coeff: string;
      desc: string;
    }

    const rows: RowData[] = [
      { name: '单张', coeff: '×1', desc: '任意 1 张' },
      { name: '对子', coeff: '×1.2', desc: '同点 2 张' },
      { name: '三张', coeff: '×1.5', desc: '同点 3 张' },
      { name: '三带一', coeff: '×1.5', desc: '三张 + 1 单张' },
      { name: '三带二', coeff: '×2', desc: '三张 + 1 对子' },
      { name: '顺子', coeff: '2+(n-5)×0.5', desc: '不小于5张点数连续牌，n为牌数' },
      { name: '连对', coeff: '×2', desc: '连续对子，3 对起' },
      { name: '飞机', coeff: '×2.5', desc: '连续三张，2 组起' },
      { name: '飞机带单', coeff: '×2.5', desc: '飞机 + 等量单张' },
      { name: '飞机带对', coeff: '×2.5', desc: '飞机 + 等量对子' },
      { name: '炸弹', coeff: '×3', desc: '同点 4 张' },
      { name: '王炸', coeff: '×4', desc: '小王 + 大王' },
    ];

    const rowH = 46;
    const nameStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#2a1008' } as const;
    const coeffStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#4a2a10' } as const;
    const descStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#5a4a30' } as const;

    rows.forEach((row, i) => {
      const y = headerY + 34 + i * rowH;
      const isOdd = i % 2 === 1;
      if (isOdd) {
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0xe8e0d0, 0.5);
        rowBg.fillRect(modalX + pad, y - rowH / 2 + 2, modalW - pad * 2, rowH - 3);
        container.add(rowBg);
      }
      if (i > 0) {
        const rowDivider = this.add.graphics();
        rowDivider.lineStyle(1, 0xd0c8b8, 0.25);
        rowDivider.lineBetween(modalX + pad, y - rowH / 2, modalX + modalW - pad, y - rowH / 2);
        container.add(rowDivider);
      }

      container.add(this.add.text(col1X, y, row.name, nameStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
      container.add(this.add.text(col2X, y, row.coeff, coeffStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
      container.add(this.add.text(col3X, y, row.desc, descStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    });

    const footerY = headerY + 24 + rows.length * rowH + 16;
    const footerDivider = this.add.graphics();
    footerDivider.lineStyle(1, 0xc8b898, 0.4);
    footerDivider.lineBetween(modalX + pad, footerY, modalX + modalW - pad, footerY);
    container.add(footerDivider);

    const noteStyle = { fontSize: '22px', fontFamily: FONT_FAMILY, color: '#5a4a30' } as const;
    const note2 = this.add.text(modalX + pad + 6, footerY + 24, '清空手牌时伤害×5', noteStyle)
      .setOrigin(0, 0).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(note2);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private closeHandPatternModal(): void {
    if (!this.handPatternModal) return;
    this.tweens.add({
      targets: this.handPatternModal,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.handPatternModal?.destroy();
        this.handPatternModal = null;
      },
    });
  }

  // ═══════════════════════════════════════════════
  //  Battle BGM
  // ═══════════════════════════════════════════════

  private initBattleBgm(): void {
    this.playRandomBattleBgm();
  }

  private playRandomBattleBgm(excludeIndex?: number): void {
    let index: number;
    do {
      index = Math.floor(Math.random() * this.battleBgmKeys.length);
    } while (index === excludeIndex && this.battleBgmKeys.length > 1);

    this.currentBattleBgmIndex = index;
    const settings = loadAudioSettings();
    this.battleBgm = this.sound.add(this.battleBgmKeys[index], { loop: false, volume: settings.bgmVolume });
    AudioManager.track(this, this.battleBgm);
    this.battleBgm.on('complete', () => this.onBattleBgmComplete());
    this.battleBgm.play();
  }

  private onBattleBgmComplete(): void {
    if (this.phase === 'game_over') return;
    this.playRandomBattleBgm(this.currentBattleBgmIndex);
  }

  // ═══════════════════════════════════════════════
  //  Settings Button & Panel
  // ═══════════════════════════════════════════════

  private createSettingsButton(w: number, _h: number): void {
    const btnX = w - 72;
    const btnY = 72;
    const btnSize = 88;

    const container = this.add.container(0, 0).setDepth(DEPTH_UI);

    const bg = this.add.graphics();
    const drawNormal = () => {
      bg.clear();
      bg.fillStyle(0xf0e8d4, 0.9);
      bg.fillCircle(btnX, btnY, btnSize / 2);
      bg.lineStyle(1.5, 0x8a6030, 0.7);
      bg.strokeCircle(btnX, btnY, btnSize / 2);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0xe0d0b0, 1);
      bg.fillCircle(btnX, btnY, btnSize / 2);
      bg.lineStyle(2, 0x6a4020, 0.9);
      bg.strokeCircle(btnX, btnY, btnSize / 2);
    };
    drawNormal();
    container.add(bg);

    const gearGfx = this.add.graphics();
    gearGfx.setPosition(btnX, btnY);
    const drawGear = () => {
      gearGfx.clear();
      const innerR = 16;
      const outerR = 20;
      const teethCount = 8;
      const steps = teethCount * 2;
      gearGfx.fillStyle(0x2a1008, 1);
      gearGfx.beginPath();
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) gearGfx.moveTo(px, py);
        else gearGfx.lineTo(px, py);
      }
      gearGfx.closePath();
      gearGfx.fillPath();
      gearGfx.fillStyle(0xf0e8d4, 1);
      gearGfx.fillCircle(0, 0, 5);
    };
    drawGear();
    container.add(gearGfx);

    const zone = this.add.zone(btnX, btnY, btnSize + 12, btnSize + 12).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => {
      drawHover();
      this.tweens.add({
        targets: gearGfx,
        angle: 90,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    });
    zone.on('pointerout', () => {
      drawNormal();
      this.tweens.add({
        targets: gearGfx,
        angle: 0,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    });
    zone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      if (this.settingsPanel) {
        this.closeSettingsPanel();
      } else {
        this.showSettingsPanel();
      }
    });
    container.add(zone);

    this.settingsButton = container;
  }

  private showSettingsPanel(): void {
    if (this.settingsPanel) return;

    const { width: sw, height: sh } = this.scale;
    const panelW = 340;
    const panelH = 180;
    const panelX = sw - 48;
    const panelY = 72;
    const radius = 10;
    const itemH = 70;
    const pad = 8;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.settingsPanel = container;

    const dismissOverlay = this.add.graphics();
    dismissOverlay.fillStyle(0x000000, 0.01);
    dismissOverlay.fillRect(0, 0, sw, sh);
    dismissOverlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    dismissOverlay.on('pointerdown', () => this.closeSettingsPanel());
    container.add(dismissOverlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.98);
    panel.fillRoundedRect(panelX - panelW, panelY, panelW, panelH, radius);
    panel.lineStyle(1.5, 0x8a6830, 0.8);
    panel.strokeRoundedRect(panelX - panelW, panelY, panelW, panelH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(panelX - panelW, panelY, panelW, panelH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const itemStyle = {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    } as const;

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xc8b898, 0.4);
    divider.lineBetween(panelX - panelW + pad, panelY + itemH, panelX - pad, panelY + itemH);
    container.add(divider);

    const volumeItemY = panelY + itemH / 2;
    const volumeText = this.add.text(panelX - panelW / 2, volumeItemY, '音量设置', itemStyle)
      .setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(volumeText);

    const volZone = this.add.zone(panelX - panelW / 2, volumeItemY, panelW - pad * 2, itemH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    volZone.on('pointerover', () => volumeText.setColor('#6a4020'));
    volZone.on('pointerout', () => volumeText.setColor('#2a1008'));
    volZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.closeSettingsPanel();
      this.showVolumeSettings();
    });
    container.add(volZone);

    const menuItemY = panelY + itemH + itemH / 2;
    const menuText = this.add.text(panelX - panelW / 2, menuItemY, '返回主菜单', itemStyle)
      .setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(menuText);

    const menuZone = this.add.zone(panelX - panelW / 2, menuItemY, panelW - pad * 2, itemH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    menuZone.on('pointerover', () => menuText.setColor('#6a4020'));
    menuZone.on('pointerout', () => menuText.setColor('#2a1008'));
    menuZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.showReturnConfirmModal();
    });
    container.add(menuZone);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 120,
      ease: 'Sine.easeOut',
    });
  }

  private closeSettingsPanel(): void {
    if (!this.settingsPanel) return;
    this.tweens.add({
      targets: this.settingsPanel,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.settingsPanel?.destroy();
        this.settingsPanel = null;
      },
    });
  }

  private showVolumeSettings(): void {
    if (this.volumeSettingsModal) return;

    const { width: sw, height: sh } = this.scale;
    const modalW = 520;
    const modalH = 300;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const radius = 12;
    const pad = 28;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.volumeSettingsModal = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf2ead8, 0.95);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(1.5, 0x8a6830, 0.7);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const topGoldLine = this.add.graphics();
    topGoldLine.fillGradientStyle(0xc8a040, 0xc8a040, 0x8a6830, 0x8a6830, 0.8);
    topGoldLine.fillRoundedRect(modalX + 16, modalY, modalW - 32, 2, 1);
    container.add(topGoldLine);

    const titleY = modalY + 42;
    const title = this.add.text(modalX + modalW / 2, titleY, '音量设置', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      stroke: '#e0d8c0',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const titleDivider = this.add.graphics();
    titleDivider.lineStyle(1, 0xd4c498, 0.5);
    titleDivider.lineBetween(modalX + pad, titleY + 18, modalX + modalW - pad, titleY + 18);
    container.add(titleDivider);

    const closeBtnW = 72;
    const closeBtnH = 36;
    const closeBtnX = modalX + modalW - closeBtnW / 2 - 14;
    const closeBtnY = modalY + 20;
    const closeBtnGfx = this.add.graphics();
    closeBtnGfx.fillStyle(0xf5f0e5, 0.9);
    closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
    closeBtnGfx.lineStyle(1.5, 0x8a6830, 0.8);
    closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
    container.add(closeBtnGfx);

    const closeText = this.add.text(closeBtnX, closeBtnY, '✕', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.add.zone(closeBtnX, closeBtnY, closeBtnW, closeBtnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => {
      closeBtnGfx.clear();
      closeBtnGfx.fillStyle(0xe8d8b8, 1);
      closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeBtnGfx.lineStyle(2, 0x6a4020, 0.9);
      closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeText.setColor('#2a1008');
    });
    closeZone.on('pointerout', () => {
      closeBtnGfx.clear();
      closeBtnGfx.fillStyle(0xf5f0e5, 0.9);
      closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeBtnGfx.lineStyle(1.5, 0x8a6830, 0.8);
      closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeText.setColor('#7a5a3a');
    });
    closeZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.closeVolumeSettings();
    });
    container.add([closeText, closeZone]);

    const settings = loadAudioSettings();

    const trackW = 360;
    const sliderX = modalX + (modalW - trackW) / 2;
    const labelX = sliderX;
    const bgmSliderY = titleY + 60;
    const sfxSliderY = bgmSliderY + 64;

    this.createVolumeSlider(
      container, labelX, bgmSliderY, sliderX, trackW,
      '音乐音量', settings.bgmVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.bgmVolume = value;
        saveAudioSettings(newSettings);
        AudioManager.setBgmVolume(value);
      }
    );

    this.createVolumeSlider(
      container, labelX, sfxSliderY, sliderX, trackW,
      '音效音量', settings.sfxVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.sfxVolume = value;
        saveAudioSettings(newSettings);
      }
    );

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private createVolumeSlider(
    parent: Phaser.GameObjects.Container,
    labelX: number, y: number,
    trackX: number, trackW: number,
    label: string,
    initialValue: number,
    onChange: (value: number) => void
  ): void {
    const trackH = 10;
    const handleR = 16;
    const trackColor = 0xd8d0c0;
    const fillColor1 = 0xc8a040;
    const fillColor2 = 0x8a6830;

    const labelText = this.add.text(labelX, y - 18, label, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(labelText);

    const trackY = y + 18;
    const trackRectX = trackX;
    const trackFillEndX = trackX + trackW;

    const trackGfx = this.add.graphics();
    trackGfx.setDepth(DEPTH_OVERLAY_TEXT);
    trackGfx.fillStyle(trackColor, 0.5);
    trackGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    trackGfx.lineStyle(1, 0xb8a898, 0.4);
    trackGfx.strokeRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    parent.add(trackGfx);

    const fillGfx = this.add.graphics();
    fillGfx.setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(fillGfx);

    const valueText = this.add.text(trackX + trackW, y - 18, `${Math.round(initialValue * 100)}%`, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setOrigin(1, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(valueText);

    const handleGfx = this.add.graphics();
    handleGfx.setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(handleGfx);

    const handleZone = this.add.zone(0, 0, handleR * 6, handleR * 6)
      .setInteractive({ cursor: 'pointer', draggable: true })
      .setDepth(DEPTH_OVERLAY_TEXT);
    this.input.setDraggable(handleZone);
    parent.add(handleZone);

    let currentValue = initialValue;
    const updateUI = (value: number) => {
      currentValue = Phaser.Math.Clamp(value, 0, 1);
      const fillWidth = trackW * currentValue;
      const handleX = trackRectX + fillWidth;

      fillGfx.clear();
      if (fillWidth > 0) {
        fillGfx.fillStyle(fillColor1, 0.9);
        fillGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, fillWidth, trackH, trackH / 2);
        if (fillWidth > trackH) {
          fillGfx.fillStyle(fillColor2, 0.6);
          fillGfx.fillRoundedRect(trackRectX + fillWidth / 2, trackY - trackH / 2, fillWidth / 2, trackH, trackH / 2);
        }
      }

      handleGfx.clear();
      handleGfx.fillStyle(0xf8f4ec, 0.4);
      handleGfx.fillCircle(handleX, trackY, handleR + 3);
      handleGfx.fillStyle(0xf5f0e5, 1);
      handleGfx.fillCircle(handleX, trackY, handleR);
      handleGfx.lineStyle(2, fillColor2, 0.9);
      handleGfx.strokeCircle(handleX, trackY, handleR);

      handleZone.setPosition(handleX, trackY);
      valueText.setText(`${Math.round(currentValue * 100)}%`);

      onChange(currentValue);
    };

    updateUI(initialValue);

    handleZone.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => {
      const ratio = (dragX - trackRectX) / trackW;
      updateUI(ratio);
    });

    const trackZone = this.add.zone(trackRectX + trackW / 2, trackY, trackW, trackH * 6)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    trackZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const ratio = (pointer.x - trackRectX) / trackW;
      updateUI(ratio);
    });
    parent.add(trackZone);
  }

  private closeVolumeSettings(): void {
    if (!this.volumeSettingsModal) return;
    this.tweens.add({
      targets: this.volumeSettingsModal,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.volumeSettingsModal?.destroy();
        this.volumeSettingsModal = null;
      },
    });
  }

  private showReturnConfirmModal(): void {
    if (this.returnConfirmModal) return;

    const { width: sw, height: sh } = this.scale;
    const modalW = 400;
    const modalH = 200;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const radius = 12;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.returnConfirmModal = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const title = this.add.text(modalX + modalW / 2, modalY + 48, '确认返回主菜单？', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const subtitle = this.add.text(modalX + modalW / 2, modalY + 82, '当前对局进度将丢失', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(subtitle);

    const btnW = 120;
    const btnH = 44;
    const btnY = modalY + 136;

    const cancelBtnX = modalX + modalW / 2 - 80;
    const cancelBg = this.add.graphics();
    cancelBg.fillStyle(0xe8dcc8, 1);
    cancelBg.fillRoundedRect(cancelBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    cancelBg.lineStyle(1.5, 0x8a6830, 0.6);
    cancelBg.strokeRoundedRect(cancelBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    container.add(cancelBg);

    const cancelText = this.add.text(cancelBtnX, btnY, '取消', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#5a4a30',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(cancelText);

    const cancelZone = this.add.zone(cancelBtnX, btnY, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    cancelZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.closeReturnConfirmModal();
    });
    container.add(cancelZone);

    const confirmBtnX = modalX + modalW / 2 + 80;
    const confirmBg = this.add.graphics();
    confirmBg.fillStyle(0xc8a878, 1);
    confirmBg.fillRoundedRect(confirmBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    confirmBg.lineStyle(1.5, 0x8a6030, 0.8);
    confirmBg.strokeRoundedRect(confirmBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    container.add(confirmBg);

    const confirmText = this.add.text(confirmBtnX, btnY, '确认', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#1a0a04',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(confirmText);

    const confirmZone = this.add.zone(confirmBtnX, btnY, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    confirmZone.on('pointerdown', () => {
      AudioManager.playSfx(this, 'sfx_button');
      this.closeReturnConfirmModal();
      this.closeSettingsPanel();
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MenuScene');
      });
    });
    container.add(confirmZone);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  private closeReturnConfirmModal(): void {
    if (!this.returnConfirmModal) return;
    this.tweens.add({
      targets: this.returnConfirmModal,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.returnConfirmModal?.destroy();
        this.returnConfirmModal = null;
      },
    });
  }

  // ═══════════════════════════════════════════════
  //  Drag-to-Select Hand Input
  // ═══════════════════════════════════════════════

  private setupHandInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.isPlayerTurn()) return;
      const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      if (idx === null) return;

      this.dragStartIndex = idx;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragActive = false;
      this.dragSelectMode = null;
      this.dragSnapshot = new Set(this.selectedIndices);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;
      if (!pointer.isDown) {
        this.resetDragState();
        return;
      }

      const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.dragStartX, this.dragStartY);
      if (!this.dragActive && dist < 8) return;

      if (!this.dragActive) {
        this.dragActive = true;
        this.dragSelectMode = this.selectedIndices.has(this.dragStartIndex) ? 'remove' : 'add';
      }

      const currentIdx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      this.applyDragRange(currentIdx);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;

      if (!this.dragActive) {
        const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
        if (idx !== null && idx === this.dragStartIndex) {
          this.onCardClick(idx);
        }
      }

      this.resetDragState();
    });
  }

  private resetDragState(): void {
    this.dragStartIndex = null;
    this.dragActive = false;
    this.dragSelectMode = null;
    this.dragTouchedIndices.clear();
    this.dragSnapshot.clear();
  }

  private applyDragRange(currentIdx: number | null): void {
    if (this.dragStartIndex === null || this.dragSelectMode === null) return;

    this.selectedIndices = new Set(this.dragSnapshot);

    if (currentIdx !== null) {
      const minIdx = Math.min(this.dragStartIndex, currentIdx);
      const maxIdx = Math.max(this.dragStartIndex, currentIdx);
      for (let i = minIdx; i <= maxIdx; i++) {
        if (this.dragSelectMode === 'add') {
          this.selectedIndices.add(i);
        } else {
          this.selectedIndices.delete(i);
        }
      }
    }

    this.renderPlayerHand();
    this.updatePatternHint();
  }

  private getCardIndexAtPosition(x: number, y: number): number | null {
    const hand = this.battle.player.hand;
    if (hand.length === 0) return null;

    const { width, height } = this.scale;
    const baseY = height - 90;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    if (y < baseY - CARD_H / 2 - 10 || y > baseY + CARD_H / 2 + 10) return null;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < hand.length; i++) {
      const cx = startX + i * overlapOffset;
      const dist = Math.abs(x - cx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestDist > CARD_W / 2) return null;

    return bestIdx;
  }

  private isPlayerTurn(): boolean {
    return this.phase === 'player_init' || this.phase === 'player_respond';
  }
}
