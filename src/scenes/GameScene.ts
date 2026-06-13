import Phaser from 'phaser';
import { Card, createDeck, shuffleDeck, cardDisplayName, sortHand } from '../models/Card';
import { BattleState, HandPattern, HAND_TYPE_LABELS } from '../models/BattleTypes';
import { identifyHand, canBeat, findAllPlays, findBeatingPlays } from '../engine/HandRecognizer';
import { calculateDamage, calculateDamageWithEmptyHand } from '../engine/DamageCalculator';
import { decidePlay } from '../engine/AIBrain';
import { loadAudioSettings } from '../AudioSettings';
import { AudioManager } from '../utils/AudioManager';

const FONT_FAMILY = '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif';
const CARD_W = 120;
const CARD_H = 168;
const SELECTED_OFFSET = -28;

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

export class GameScene extends Phaser.Scene {
  private battle!: BattleState;
  private phase: GamePhase = 'player_init';

  private selectedIndices: Set<number> = new Set();
  private cardObjects: Phaser.GameObjects.Container[] = [];
  private enemyCardObjects: Phaser.GameObjects.Container[] = [];
  private tableEnemyCards: Phaser.GameObjects.Container[] = [];
  private tablePlayerCards: Phaser.GameObjects.Container[] = [];

  private playerVitalityBar!: Phaser.GameObjects.Graphics;
  private enemyVitalityBar!: Phaser.GameObjects.Graphics;
  private playerVitalityText!: Phaser.GameObjects.Text;
  private enemyVitalityText!: Phaser.GameObjects.Text;
  private patternHintText!: Phaser.GameObjects.Text;
  private turnIndicatorText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private btnPlay!: Phaser.GameObjects.Container;
  private btnPass!: Phaser.GameObjects.Container;
  private btnPlayText!: Phaser.GameObjects.Text;
  private btnPassText!: Phaser.GameObjects.Text;

  private enemyNameText!: Phaser.GameObjects.Text;
  private playerNameText!: Phaser.GameObjects.Text;

  private tableEnemyGroup!: Phaser.GameObjects.Container;
  private tablePlayerGroup!: Phaser.GameObjects.Container;

  private cardHandGroup!: Phaser.GameObjects.Container;
  private aiHandGroup!: Phaser.GameObjects.Container;

  private deck: Card[] = [];

  private battleBgm: Phaser.Sound.BaseSound | null = null;
  private battleBgmKeys = ['bgm_battle_1', 'bgm_battle_2', 'bgm_battle_3', 'bgm_battle_4'];
  private currentBattleBgmIndex = -1;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.phase = 'player_init';
    this.selectedIndices = new Set();
    this.cardObjects = [];
    this.enemyCardObjects = [];
    this.tableEnemyCards = [];
    this.tablePlayerCards = [];
    this.deck = [];

    const { width, height } = this.scale;
    this.cameras.main.fadeIn(400);

    this.drawBackground(width, height);
    this.createInfoBars(width, height);
    this.createTableArea(width, height);
    this.createButtons(width, height);
    this.createPatternHint(width, height);
    this.createTurnIndicator(width, height);

    this.deck = shuffleDeck(createDeck());
    this.battle = this.initBattle();

    this.renderAllCards();
    this.updateVitalityBars();
    this.updateUIForPhase();

    AudioManager.init(this);
    AudioManager.unlock(this);
    this.initBattleBgm();
  }

  private initBattle(): BattleState {
    const deck = [...this.deck];
    const playerHand = deck.splice(0, 17);
    const enemyHand = deck.splice(0, 17);

    sortHand(playerHand);
    sortHand(enemyHand);

    return {
      player: {
        hand: playerHand,
        vitality: 500,
        vitalityMax: 500,
        name: '玩家',
      },
      enemy: {
        hand: enemyHand,
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
    const bg = this.add.graphics();
    bg.setDepth(-10);
    bg.fillStyle(0x1a0f05, 1);
    bg.fillRect(0, 0, w, h);

    const border = this.add.graphics();
    border.setDepth(-5);
    border.lineStyle(1, 0x4a3020, 0.3);
    border.strokeRect(8, 8, w - 16, h - 16);
  }

  private createInfoBars(w: number, _h: number): void {
    // Enemy info bar (top)
    const enemyBarY = 36;
    const enemyBarX = 120;
    const barW = 300;
    const barH = 27;

    this.enemyNameText = this.add.text(enemyBarX, enemyBarY - 16, '山贼头目', {
      fontSize: '18px',
      fontFamily: FONT_FAMILY,
      color: '#d4a843',
    });

    const enemyBg = this.add.graphics();
    enemyBg.fillStyle(0x2a1a0f, 0.8);
    enemyBg.fillRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);
    enemyBg.lineStyle(1, 0x5a4030, 0.6);
    enemyBg.strokeRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);

    this.enemyVitalityBar = this.add.graphics();
    this.enemyVitalityText = this.add.text(enemyBarX + barW / 2, enemyBarY + 6 + barH / 2, '', {
      fontSize: '12px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
    }).setOrigin(0.5);

    // 玩家信息栏（中下方，高于按钮和手牌）
    const playerBarY = _h - 300;

    this.playerNameText = this.add.text(enemyBarX, playerBarY - 16, '玩家', {
      fontSize: '18px',
      fontFamily: FONT_FAMILY,
      color: '#d4a843',
    });

    const playerBg = this.add.graphics();
    playerBg.fillStyle(0x2a1a0f, 0.8);
    playerBg.fillRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);
    playerBg.lineStyle(1, 0x5a4030, 0.6);
    playerBg.strokeRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);

    this.playerVitalityBar = this.add.graphics();
    this.playerVitalityText = this.add.text(enemyBarX + barW / 2, playerBarY + 6 + barH / 2, '', {
      fontSize: '12px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
    }).setOrigin(0.5);

    // Round counter
    this.roundText = this.add.text(w - 36, 36, '第 1 回合', {
      fontSize: '14px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(1, 0);
  }

  private createTableArea(_w: number, _h: number): void {
    // Table center area for played cards
    this.tableEnemyGroup = this.add.container(960, 330);
    this.tablePlayerGroup = this.add.container(960, 540);
  }

  private createButtons(w: number, h: number): void {
    const btnY = h - 195;
    const btnW = 180;
    const btnH = 60;

    // Play button
    this.btnPlay = this.add.container(w / 2 - 120, btnY);
    const playBg = this.add.graphics();
    playBg.fillStyle(0x5a3018, 1);
    playBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    playBg.lineStyle(1.5, 0xc8a050, 0.85);
    playBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.btnPlay.add(playBg);

    this.btnPlayText = this.add.text(0, 0, '出  牌', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#2a1008',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnPlay.add(this.btnPlayText);

    const playZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    playZone.on('pointerdown', () => this.onPlayClick());
    this.btnPlay.add(playZone);

    // Pass button
    this.btnPass = this.add.container(w / 2 + 120, btnY);
    const passBg = this.add.graphics();
    passBg.fillStyle(0x2a1a0f, 1);
    passBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    passBg.lineStyle(1, 0x5a4030, 0.6);
    passBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.btnPass.add(passBg);

    this.btnPassText = this.add.text(0, 0, '不  出', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
      stroke: '#1a0a00',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.btnPass.add(this.btnPassText);

    const passZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    passZone.on('pointerdown', () => this.onPassClick());
    this.btnPass.add(passZone);
  }

  private createPatternHint(w: number, h: number): void {
    this.patternHintText = this.add.text(w / 2, h - 232, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#b89050',
    }).setOrigin(0.5);
  }

  private createTurnIndicator(w: number, _h: number): void {
    this.turnIndicatorText = this.add.text(w / 2, 120, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#d4a843',
      stroke: '#1a0800',
      strokeThickness: 1,
    }).setOrigin(0.5);
  }

  // ═══════════════════════════════════════════════
  //  Card Rendering
  // ═══════════════════════════════════════════════

  private createCardDisplay(card: Card, x: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const isRed = card.suit === 'heart' || card.suit === 'diamond';
    const textColor = isRed ? '#e04040' : '#e8d5a3';

    const bg = this.add.graphics();
    bg.fillStyle(0x0d0804, 1);
    bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);
    bg.lineStyle(1.5, 0xb89040, 0.6);
    bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);
    container.add(bg);

    const display = cardDisplayName(card);
    const rankText = this.add.text(0, -4, display, {
      fontSize: card.rank >= 25 ? '20px' : '22px',
      fontFamily: FONT_FAMILY,
      color: card.suit === null ? '#e8c840' : textColor,
    }).setOrigin(0.5);
    container.add(rankText);

    return container;
  }

  private createCardInteractive(card: Card, x: number, y: number, index: number): Phaser.GameObjects.Container {
    const container = this.createCardDisplay(card, x, y);
    container.setDepth(10);
    container.setData('cardIndex', index);

    const zone = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
    zone.on('pointerdown', () => this.onCardClick(index));
    container.add(zone);

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
    const baseY = height - 63;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * overlapOffset;
      const isSelected = this.selectedIndices.has(i);
      const y = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const obj = this.createCardInteractive(hand[i], x, y, i);
      obj.setDepth(10 + i);
      this.cardObjects.push(obj);
    }
  }

  private renderEnemyHand(): void {
    this.enemyCardObjects.forEach(c => c.destroy());
    this.enemyCardObjects = [];

    const hand = this.battle.enemy.hand;
    const { width } = this.scale;
    const baseY = 165;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * overlapOffset;
      const container = this.add.container(x, baseY);
      container.setDepth(1 + i);
      container.setData('cardIndex', i);

      const bg = this.add.graphics();
      bg.fillStyle(0x152040, 1);
      bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);
      bg.lineStyle(2, 0x3050a0, 0.5);
      bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);

      const inner = this.add.graphics();
      inner.lineStyle(1, 0x284090, 0.4);
      inner.strokeRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, CARD_H - 12, 3);
      container.add(inner);

      const hw = CARD_W / 2;
      const hh = CARD_H / 2;
      bg.lineStyle(1, 0x2a45a0, 0.3);
      bg.lineBetween(-hw, -hh, hw, hh);
      bg.lineBetween(-hw, hh, hw, -hh);
      container.add(bg);

      this.enemyCardObjects.push(container);
    }
  }

  private showPlayedCards(cards: Card[], isPlayer: boolean): void {
    const oldOwnCards = isPlayer ? [...this.tablePlayerCards] : [...this.tableEnemyCards];
    const oldOpponentCards = isPlayer ? [...this.tableEnemyCards] : [...this.tablePlayerCards];

    this.tablePlayerCards = [];
    this.tableEnemyCards = [];

    const createNewCards = () => {
      const gap = CARD_W * 0.75;
      const totalW = CARD_W + (cards.length - 1) * gap;
      const startX = -totalW / 2 + CARD_W / 2;

      for (let i = 0; i < cards.length; i++) {
        const x = startX + i * gap;
        const obj = this.createCardDisplay(cards[i], x, 0);
        obj.setDepth(5);
        if (isPlayer) {
          this.tablePlayerGroup.add(obj);
          this.tablePlayerCards.push(obj);
        } else {
          this.tableEnemyGroup.add(obj);
          this.tableEnemyCards.push(obj);
        }
      }
    };

    const allOld = [...oldOwnCards, ...oldOpponentCards];
    if (allOld.length === 0) {
      createNewCards();
      return;
    }

    let completed = 0;
    for (const c of allOld) {
      this.tweens.add({
        targets: c,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        duration: 250,
        ease: 'Sine.easeIn',
        onComplete: () => {
          c.destroy();
          completed++;
          if (completed >= allOld.length) {
            createNewCards();
          }
        },
      });
    }
  }

  private fadeOutTablePlayerCards(onComplete: () => void): void {
    const cards = [...this.tablePlayerCards];
    this.tablePlayerCards = [];
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
        duration: 250,
        ease: 'Sine.easeIn',
        onComplete: () => {
          c.destroy();
          done++;
          if (done >= cards.length) onComplete();
        },
      });
    }
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

    const animatedCards: Phaser.GameObjects.Container[] = [];
    for (const idx of this.selectedIndices) {
      const cardObj = this.cardObjects.find(c => c.getData('cardIndex') === idx);
      if (cardObj) {
        animatedCards.push(cardObj);
        const arrIdx = this.cardObjects.indexOf(cardObj);
        if (arrIdx >= 0) this.cardObjects.splice(arrIdx, 1);
      }
    }

    this.selectedIndices.clear();

    const onComplete = () => {
      animatedCards.forEach(c => c.destroy());

      for (const i of indicesToRemove) {
        playerHand.splice(i, 1);
      }

      this.battle.lastPlay = pattern;
      this.battle.turnHolder = 'player';

      sortHand(playerHand);
      this.showPlayedCards(cards, true);
      this.renderPlayerHand();
      this.updatePatternHint();

      if (playerHand.length === 0) {
        const dmg = calculateDamageWithEmptyHand(pattern);
        this.battle.enemy.vitality -= dmg;
        this.updateVitalityBars();
        this.showFloatingText(-dmg, 270, 35, '#e04040');

        this.time.delayedCall(1500, () => {
          if (this.battle.enemy.vitality <= 0) {
            this.showGameOver(true);
            return;
          }
          this.battle.lastPlay = null;
          this.redrawPlayerHand();
          this.renderPlayerHand();
          this.fadeOutTablePlayerCards(() => {
            this.phase = 'player_init';
            this.updateUIForPhase();
          });
        });
        return;
      }

      this.time.delayedCall(600, () => {
        this.phase = 'ai_respond';
        this.updateUIForPhase();
        this.aiRespond();
      });
    };

    if (animatedCards.length === 0) {
      onComplete();
      return;
    }

    let done = 0;
    for (const cardObj of animatedCards) {
      this.tweens.add({
        targets: cardObj,
        y: cardObj.y - 195,
        alpha: 0.3,
        duration: 350,
        ease: 'Sine.easeIn',
        onComplete: () => {
          done++;
          if (done >= animatedCards.length) {
            onComplete();
          }
        },
      });
    }
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

    const damage = calculateDamage(this.battle.lastPlay);

    if (who === 'player') {
      this.battle.player.vitality -= damage;
      this.battle.turnHolder = 'enemy';
      this.updateVitalityBars();
      this.renderPlayerHand();
      this.updatePatternHint();

      this.showFloatingText(-damage, 270, this.scale.height - 283, '#e04040');

      this.time.delayedCall(1200, () => {
        if (this.battle.player.vitality <= 0) {
          this.showGameOver(false);
          return;
        }
        this.battle.lastPlay = null;
        const oldEnemyCards = [...this.tableEnemyCards];
        this.tableEnemyCards = [];
        const afterFade = () => {
          this.phase = 'ai_init';
          this.updateUIForPhase();
          this.aiInitiatePlay();
        };
        if (oldEnemyCards.length === 0) {
          afterFade();
          return;
        }
        let done = 0;
        for (const c of oldEnemyCards) {
          this.tweens.add({
            targets: c,
            alpha: 0,
            scaleX: 0.5,
            scaleY: 0.5,
            duration: 250,
            ease: 'Sine.easeIn',
            onComplete: () => {
              c.destroy();
              done++;
              if (done >= oldEnemyCards.length) afterFade();
            },
          });
        }
      });
    } else {
      this.battle.enemy.vitality -= damage;
      this.battle.turnHolder = 'player';
      this.updateVitalityBars();

      this.showFloatingText(-damage, 270, 35, '#e04040');

      this.time.delayedCall(1200, () => {
        if (this.battle.enemy.vitality <= 0) {
          this.showGameOver(true);
          return;
        }
        this.battle.lastPlay = null;
        this.fadeOutTablePlayerCards(() => {
          this.phase = 'player_init';
          this.updateUIForPhase();
        });
      });
    }
  }

  private redrawPlayerHand(): void {
    if (this.deck.length < 17) {
      this.deck = shuffleDeck(createDeck());
    }
    this.battle.player.hand = this.deck.splice(0, 17);
    sortHand(this.battle.player.hand);
  }

  private redrawEnemyHand(): void {
    if (this.deck.length < 17) {
      this.deck = shuffleDeck(createDeck());
    }
    this.battle.enemy.hand = this.deck.splice(0, 17);
    sortHand(this.battle.enemy.hand);
  }

  private aiRespond(): void {
    this.time.delayedCall(800, () => {
      this.battle.phase = 'respond';
      const cards = decidePlay(this.battle);
      if (!cards || cards.length === 0) {
        this.executePass('enemy');
        return;
      }

      const pattern = identifyHand(cards)!;
      const enemyHand = this.battle.enemy.hand;
      const indicesToRemove = this.findCardIndices(enemyHand, cards);

      const animatedCards: Phaser.GameObjects.Container[] = [];
      for (const idx of indicesToRemove) {
        if (idx < this.enemyCardObjects.length) {
          const cardObj = this.enemyCardObjects[idx];
          animatedCards.push(cardObj);
        }
      }

      for (const cardObj of animatedCards) {
        const arrIdx = this.enemyCardObjects.indexOf(cardObj);
        if (arrIdx >= 0) this.enemyCardObjects.splice(arrIdx, 1);
      }

      const finish = () => {
        animatedCards.forEach(c => c.destroy());

        for (const i of indicesToRemove) {
          enemyHand.splice(i, 1);
        }
        sortHand(enemyHand);

        this.battle.lastPlay = pattern;
        this.battle.turnHolder = 'enemy';

        this.showPlayedCards(cards, false);
        this.renderEnemyHand();
        this.updateTurnIndicator('enemy');

        if (enemyHand.length === 0) {
          const dmg = calculateDamageWithEmptyHand(pattern);
          this.battle.player.vitality -= dmg;
          this.updateVitalityBars();
          this.showFloatingText(-dmg, 270, this.scale.height - 283, '#e04040');

          this.time.delayedCall(1500, () => {
            if (this.battle.player.vitality <= 0) {
              this.showGameOver(false);
              return;
            }
            this.battle.lastPlay = null;
            this.redrawEnemyHand();
            this.renderEnemyHand();
            this.tableEnemyCards.forEach(c => c.destroy());
            this.tableEnemyCards = [];
            this.fadeOutTablePlayerCards(() => {
              this.phase = 'ai_init';
              this.updateUIForPhase();
              this.aiInitiatePlay();
            });
          });
          return;
        }

        this.time.delayedCall(600, () => {
          this.phase = 'player_respond';
          this.updateUIForPhase();
        });
      };

      if (animatedCards.length === 0) {
        finish();
        return;
      }

      let done = 0;
      for (const cardObj of animatedCards) {
        this.tweens.add({
          targets: cardObj,
          y: cardObj.y + 195,
          alpha: 0.3,
          duration: 200,
          ease: 'Sine.easeIn',
          onComplete: () => {
            done++;
            if (done >= animatedCards.length) {
              finish();
            }
          },
        });
      }
    });
  }

  private aiInitiatePlay(): void {
    this.time.delayedCall(800, () => {
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
      const enemyHand = this.battle.enemy.hand;
      const indicesToRemove = this.findCardIndices(enemyHand, cards);

      const animatedCards: Phaser.GameObjects.Container[] = [];
      for (const idx of indicesToRemove) {
        if (idx < this.enemyCardObjects.length) {
          const cardObj = this.enemyCardObjects[idx];
          animatedCards.push(cardObj);
        }
      }

      for (const cardObj of animatedCards) {
        const arrIdx = this.enemyCardObjects.indexOf(cardObj);
        if (arrIdx >= 0) this.enemyCardObjects.splice(arrIdx, 1);
      }

      const finish = () => {
        animatedCards.forEach(c => c.destroy());

        for (const i of indicesToRemove) {
          enemyHand.splice(i, 1);
        }
        sortHand(enemyHand);

        this.battle.lastPlay = pattern;
        this.battle.turnHolder = 'enemy';

        this.showPlayedCards(cards, false);
        this.renderEnemyHand();
        this.updateTurnIndicator('enemy');

        if (enemyHand.length === 0) {
          const dmg = calculateDamageWithEmptyHand(pattern);
          this.battle.player.vitality -= dmg;
          this.updateVitalityBars();
          this.showFloatingText(-dmg, 270, this.scale.height - 283, '#e04040');

          this.time.delayedCall(1500, () => {
            if (this.battle.player.vitality <= 0) {
              this.showGameOver(false);
              return;
            }
            this.battle.lastPlay = null;
            this.redrawEnemyHand();
            this.renderEnemyHand();
            this.tableEnemyCards.forEach(c => c.destroy());
            this.tableEnemyCards = [];
            this.fadeOutTablePlayerCards(() => {
              this.phase = 'ai_init';
              this.updateUIForPhase();
              this.aiInitiatePlay();
            });
          });
          return;
        }

        this.time.delayedCall(600, () => {
          this.phase = 'player_respond';
          this.updateUIForPhase();
        });
      };

      if (animatedCards.length === 0) {
        finish();
        return;
      }

      let done = 0;
      for (const cardObj of animatedCards) {
        this.tweens.add({
          targets: cardObj,
          y: cardObj.y + 195,
          alpha: 0.3,
          duration: 200,
          ease: 'Sine.easeIn',
          onComplete: () => {
            done++;
            if (done >= animatedCards.length) {
              finish();
            }
          },
        });
      }
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
    switch (this.phase) {
      case 'player_init':
        if (this.playerHasPlayablePattern()) {
          this.turnIndicatorText.setText('你的回合：请出牌');
        } else {
          this.turnIndicatorText.setText('无牌可出，请选择不出');
        }
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPassText.setColor('#5a4030');
        this.btnPass.setVisible(false);
        break;
      case 'player_respond':
        this.turnIndicatorText.setText('对方出牌，请接牌或放弃');
        this.btnPlay.setVisible(this.playerHasPlayablePattern());
        this.btnPass.setVisible(true);
        this.btnPassText.setColor('#e8d5a3');
        if (!this.playerHasPlayablePattern()) {
          this.turnIndicatorText.setText('无牌可接，请选择不出');
        }
        break;
      case 'ai_init':
        this.turnIndicatorText.setText('对方正在思考...');
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#5a4030');
        break;
      case 'ai_respond':
        this.turnIndicatorText.setText('对方正在接牌...');
        this.btnPlay.setVisible(false);
        this.btnPass.setVisible(false);
        this.btnPassText.setColor('#5a4030');
        break;
      case 'game_over':
        this.turnIndicatorText.setText('');
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
    if (who === 'player') {
      this.turnIndicatorText.setText('你的回合：请出牌');
    } else {
      this.turnIndicatorText.setText('对方正在思考...');
    }
  }

  private updateVitalityBars(): void {
    const { height } = this.scale;
    const barX = 120;
    const barW = 300;
    const barH = 27;

    this.drawVitalityBar(
      this.enemyVitalityBar,
      this.enemyVitalityText,
      this.battle.enemy.vitality,
      this.battle.enemy.vitalityMax,
      barX, 42, barW, barH
    );
    this.drawVitalityBar(
      this.playerVitalityBar,
      this.playerVitalityText,
      this.battle.player.vitality,
      this.battle.player.vitalityMax,
      barX, height - 294, barW, barH
    );
    this.roundText.setText(`第 ${this.battle.turnCount} 回合`);
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
    gfx.fillStyle(0x2a1a0f, 0.8);
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
    gfx.lineStyle(1, 0x5a4030, 0.6);
    gfx.strokeRoundedRect(barX, barY, barW, barH, 4);

    text.setText(`${current} / ${max}`);
    text.setPosition(barX + barW / 2, barY + barH / 2);
  }

  private showFloatingText(value: number, x: number, y: number, color: string): void {
    const text = this.add.text(x, y, `${value}`, {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: text,
      y: y - 90,
      alpha: { from: 1, to: 0 },
      duration: 1500,
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
    }

    const { width, height } = this.scale;
    const overlay = this.add.graphics();
    overlay.setDepth(90);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);

    const resultText = playerWin ? '胜利' : '败北';
    const resultColor = playerWin ? '#e8c840' : '#a04040';

    const title = this.add.text(width / 2, height / 2 - 50, resultText, {
      fontSize: '64px',
      fontFamily: FONT_FAMILY,
      color: resultColor,
      stroke: '#1a0800',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(100);

    const hint = this.add.text(width / 2, height / 2 + 30, '点击返回主菜单', {
      fontSize: '18px',
      fontFamily: FONT_FAMILY,
      color: '#b89050',
    }).setOrigin(0.5).setDepth(100);

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
}
