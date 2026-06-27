import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { sortPlayedCards } from '../../models/Card';
import { waitForTween, fadeOutAndDestroy } from '../../utils/AnimationUtils';
import {
  FONT_FAMILY, CARD_W, CARD_H, SELECTED_OFFSET,
  DEPTH_PLAYER_HAND, DEPTH_ENEMY_HAND, DEPTH_CENTER_BASE,
} from '../../constants/Layout';

export interface CardDisplayHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly time: Phaser.Time.Clock;
  battle: { player: { hand: Card[] }; enemy: { hand: Card[] } };
  cardObjects: Phaser.GameObjects.Container[];
  enemyCardObjects: Phaser.GameObjects.Container[];
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  centerDepthCounter: number;
  selectedIndices: Set<number>;
  revealedEnemyCards: Set<Card>;
}

export class CardDisplayManager {
  private host: CardDisplayHost;
  private scene: Phaser.Scene;

  constructor(host: CardDisplayHost & Phaser.Scene) {
    this.host = host;
    this.scene = host;
  }

  createCardDisplay(card: Card, x: number, y: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = this.host.add.container(x, y);
    const halfW = CARD_W / 2;
    const halfH = CARD_H / 2;

    const shadowG = this.host.add.graphics();
    container.add(shadowG);
    container.setData('_shadowG', shadowG);
    shadowG.fillStyle(0x1a0a04, 0.25);
    shadowG.fillRoundedRect(-halfW + 5, -halfH + 6, CARD_W, CARD_H, 8);

    const glowG = this.host.add.graphics();
    container.add(glowG);
    container.setData('_glowG', glowG);
    glowG.fillStyle(0xffd700, 0.30);
    glowG.fillRoundedRect(-halfW - 4, -halfH - 4, CARD_W + 8, CARD_H + 8, 10);
    glowG.fillStyle(0xffd700, 0.18);
    glowG.fillRoundedRect(-halfW - 9, -halfH - 9, CARD_W + 18, CARD_H + 18, 12);
    glowG.fillStyle(0xffd700, 0.09);
    glowG.fillRoundedRect(-halfW - 15, -halfH - 15, CARD_W + 30, CARD_H + 30, 14);
    glowG.setAlpha(isSelected ? 1 : 0);

    const isRed = card.suit === 'heart' || card.suit === 'diamond';
    const textColor = isRed ? '#b02828' : '#1a0a04';
    const isJoker = card.rank >= 25;

    const suitSymbol: Record<string, string> = {
      spade: '♠', club: '♣', heart: '♥', diamond: '♦',
    };

    const g = this.host.add.graphics();

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
      const rankTxt = this.host.add.text(cornerX, cornerY, card.rankLabel, {
        fontSize: '34px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0, 0);
      container.add(rankTxt);

      const suitTxt = this.host.add.text(cornerX, cornerY + 34, suitSymbol[card.suit!]!, {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0, 0);
      container.add(suitTxt);

      // Large faded suit symbol in center
      const centerSuit = this.host.add.text(0, 0, suitSymbol[card.suit!]!, {
        fontSize: '60px',
        fontFamily: FONT_FAMILY,
        color: textColor,
      }).setOrigin(0.5).setAlpha(0.12);
      container.add(centerSuit);
    }

    // ═══ Joker rendering ═══
    if (isJoker) {
      const jokerColor = card.rank === 30 ? '#c9a030' : '#1a0a04';

      const cornerLabel = this.host.add.text(cornerX, cornerY, card.rankLabel, {
        fontSize: '30px',
        fontFamily: FONT_FAMILY,
        color: jokerColor,
      }).setOrigin(0, 0);
      container.add(cornerLabel);

      const patternName = card.rank === 30 ? 'card_pattern_dragon' : 'card_pattern_tiger';
      const pattern = this.host.add.image(0, 0, patternName);
      const maxPatternW = CARD_W * 0.7;
      const maxPatternH = CARD_H * 0.7;
      const scale = Math.min(maxPatternW / pattern.width, maxPatternH / pattern.height);
      if (scale < 1) {
        pattern.setScale(scale);
      }
      container.add(pattern);

      const label = this.host.add.text(0, halfH - 22, 'JOKER', {
        fontSize: '13px',
        fontFamily: FONT_FAMILY,
        color: '#8a6830',
      }).setOrigin(0.5);
      container.add(label);
    }

    container.setData('uid', card.uid);
    container.setData('rank', card.rank);
    container.setData('suit', card.suit ?? '');

    if (card.isTemp) {
      const spiderGfx = this.host.add.graphics();
      const hw = halfW;
      const hh = halfH;
      spiderGfx.lineStyle(1, 0x88aacc, 0.6);
      spiderGfx.lineBetween(0, 0, -hw, -hh);
      spiderGfx.lineBetween(0, 0, hw, -hh * 0.7);
      spiderGfx.lineBetween(0, 0, -hw * 0.6, hh);
      spiderGfx.lineBetween(0, 0, hw * 0.8, hh * 0.3);
      spiderGfx.lineBetween(0, 0, 0, -hh);
      spiderGfx.lineBetween(0, 0, -hw * 0.3, hh * 0.5);
      spiderGfx.lineBetween(0, 0, hw * 0.4, -hh * 0.3);
      spiderGfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.7, -hh * 0.1);
      spiderGfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.15, -hh * 0.7);
      spiderGfx.lineBetween(hw * 0.5, -hh * 0.2, hw * 0.3, -hh * 0.6);
      spiderGfx.lineBetween(0, -hh * 0.5, hw * 0.25, -hh * 0.8);
      spiderGfx.lineStyle(0.8, 0x88aacc, 0.35);
      spiderGfx.lineBetween(-hw * 0.15, -hh * 0.7, -hw * 0.45, -hh * 0.55);
      spiderGfx.lineBetween(-hw * 0.7, -hh * 0.1, -hw * 0.5, hh * 0.2);
      spiderGfx.lineBetween(hw * 0.3, -hh * 0.6, hw * 0.6, -hh * 0.4);
      spiderGfx.lineBetween(0, hh, -hw * 0.4, hh * 0.35);
      spiderGfx.lineBetween(-hw * 0.3, hh * 0.5, -hw * 0.6, hh * 0.1);
      spiderGfx.setAlpha(0.4);
      container.add(spiderGfx);
    }

    return container;
  }

  renderAllCards(): void {
    this.renderPlayerHand(true);
    this.renderEnemyHand(true);
  }

  renderPlayerHand(animateEntry: boolean = false): void {
    this.host.cardObjects.forEach(c => c.destroy());
    this.host.cardObjects = [];

    const hand = this.host.battle.player.hand;
    const { width, height } = this.host.scale;
    const baseY = height - 90;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;
    const offscreenX = width + CARD_W;

    for (let i = 0; i < hand.length; i++) {
      const targetX = startX + i * overlapOffset;
      const isSelected = this.host.selectedIndices.has(i);
      const y = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const initX = animateEntry ? offscreenX : targetX;
      const obj = this.createCardInteractive(hand[i]!, initX, y, i, isSelected);
      obj.setDepth(DEPTH_PLAYER_HAND + i);
      this.host.cardObjects.push(obj);

      if (animateEntry) {
        this.host.tweens.add({
          targets: obj,
          x: targetX,
          duration: 200,
          delay: i * 50,
          ease: 'Cubic.easeOut',
        });
      }
    }
  }

  renderEnemyHand(animateEntry: boolean = false, baseDelay: number = 700, onComplete?: () => void): void {
    this.host.enemyCardObjects.forEach(c => c.destroy());
    this.host.enemyCardObjects = [];

    const hand = this.host.battle.enemy.hand;
    const { width } = this.host.scale;
    const baseY = 220;
    const overlapOffset = CARD_W * 0.75;
    const totalW = CARD_W + (hand.length - 1) * overlapOffset;
    const startX = (width - totalW) / 2 + CARD_W / 2;

    const revealedIndices = this.getRevealedEnemyCardIndices();

    for (let i = 0; i < hand.length; i++) {
      const targetX = startX + i * overlapOffset;
      const initY = animateEntry ? -CARD_H : baseY;
      const container = this.host.add.container(targetX, initY);
      container.setDepth(DEPTH_ENEMY_HAND + i);
      container.setData('cardIndex', i);
      const hc = hand[i]!;
      container.setData('uid', hc.uid);
      container.setData('rank', hc.rank);
      container.setData('suit', hc.suit ?? '');
      if (animateEntry) {
        container.setAlpha(0);
      }

      const enemyShadowG = this.host.add.graphics();
      enemyShadowG.fillStyle(0x1a0a04, 0.25);
      enemyShadowG.fillRoundedRect(-CARD_W / 2 + 5, -CARD_H / 2 + 6, CARD_W, CARD_H, 8);
      container.add(enemyShadowG);

      if (revealedIndices.has(i)) {
        const revealedDisplay = this.createCardDisplay(hand[i]!, 0, 0, false);
        revealedDisplay.setAlpha(0.6);
        revealedDisplay.setScale(0.75);
        container.add(revealedDisplay);
      } else {
        const cardBack = this.host.add.image(0, 0, 'card_back');
        cardBack.setDisplaySize(CARD_W, CARD_H);
        container.add(cardBack);
      }

      this.host.enemyCardObjects.push(container);

      if (animateEntry) {
        this.host.tweens.add({
          targets: container,
          y: baseY,
          alpha: 1,
          duration: 120,
          delay: baseDelay + i * 100,
          ease: 'Cubic.easeOut',
        });
      }
    }

    if (animateEntry) {
      if (hand.length === 0 && onComplete) {
        onComplete();
      } else if (hand.length > 0) {
        const lastCardAnimEnd = baseDelay + (hand.length - 1) * 100 + 120;
        this.host.time.delayedCall(lastCardAnimEnd, () => {
          onComplete?.();
        });
      }
    } else if (onComplete) {
      onComplete();
    }
  }

  getRevealedEnemyCardIndices(): Set<number> {
    if (this.host.revealedEnemyCards.size === 0) return new Set();
    if (this.host.battle.enemy.hand.length === 0) return new Set();

    const indices = new Set<number>();
    for (let i = 0; i < this.host.battle.enemy.hand.length; i++) {
      if (this.host.revealedEnemyCards.has(this.host.battle.enemy.hand[i]!)) {
        indices.add(i);
      }
    }
    return indices;
  }

  getCardFanPositions(count: number, centerX: number, centerY: number): Array<{ x: number; y: number }> {
    const gap = CARD_W * 0.75;
    const totalW = CARD_W + (count - 1) * gap;
    const startX = centerX - totalW / 2 + CARD_W / 2;
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      positions.push({ x: startX + i * gap, y: centerY });
    }
    return positions;
  }

  animateCardsToPositions(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
    onComplete?: () => void
  ): void {
    if (cards.length === 0) {
      onComplete?.();
      return;
    }
    const baseDepth = this.host.centerDepthCounter;
    this.host.centerDepthCounter += cards.length;
    let completed = 0;
    for (let i = 0; i < cards.length; i++) {
      cards[i]!.setDepth(baseDepth + i);
      this.host.tweens.add({
        targets: cards[i]!,
        x: positions[i]!.x,
        y: positions[i]!.y,
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

  clearCenterCards(): void {
    for (const c of this.host.centerCards) {
      c.destroy();
    }
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;
  }

  fadeOutCenterCards(onComplete: () => void): void {
    const cards = [...this.host.centerCards];
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    if (cards.length === 0) {
      onComplete();
      return;
    }
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;
    let done = 0;
    for (const c of cards) {
      this.host.tweens.add({
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

  animateShiftAndReplace(
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

    const shiftDepth = this.host.centerDepthCounter;
    this.host.centerDepthCounter += newCards.length + oldCards.length;

    for (const c of oldCards) {
      c.setDepth(shiftDepth + oldCards.indexOf(c));
      this.host.tweens.add({
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
      newCards[i]!.setDepth(shiftDepth + oldCards.length + i);
      this.host.tweens.add({
        targets: newCards[i]!,
        x: newPositions[i]!.x,
        y: newPositions[i]!.y,
        duration,
        ease: 'Sine.easeOut',
        onComplete: checkDone,
      });
    }
  }

  createEnemyDisplayCards(indices: number[]): Phaser.GameObjects.Container[] {
    const entries: Array<{ card: Card; x: number; y: number; isRevealed: boolean }> = [];

    for (const idx of indices) {
      if (idx < this.host.battle.enemy.hand.length) {
        const card = this.host.battle.enemy.hand[idx]!;
        const isRevealed = this.host.revealedEnemyCards.has(card);
        if (isRevealed) {
          this.host.revealedEnemyCards.delete(card);
        }
        let x: number;
        let y: number;
        if (idx < this.host.enemyCardObjects.length) {
          x = this.host.enemyCardObjects[idx]!.x;
          y = this.host.enemyCardObjects[idx]!.y;
        } else {
          const { width } = this.host.scale;
          const overlapOffset = CARD_W * 0.75;
          const totalW = CARD_W + (this.host.battle.enemy.hand.length - 1) * overlapOffset;
          const startX = (width - totalW) / 2 + CARD_W / 2;
          x = startX + idx * overlapOffset;
          y = 220;
        }
        entries.push({ card, x, y, isRevealed });
      }
    }

    const sortedCards = sortPlayedCards(entries.map(e => e.card));
    const cardToEntry = new Map<Card, typeof entries[0]>();
    for (const entry of entries) {
      cardToEntry.set(entry.card, entry);
    }

    const baseDepth = this.host.centerDepthCounter;
    this.host.centerDepthCounter += entries.length;
    const displayCards: Phaser.GameObjects.Container[] = [];
    for (const card of sortedCards) {
      const entry = cardToEntry.get(card);
      if (entry) {
        const display = this.createCardDisplay(card, entry.x, entry.y, false);
        display.setDepth(baseDepth + displayCards.length);
        if (entry.isRevealed) {
          display.setData('isRevealed', true);
        }
        displayCards.push(display);
        cardToEntry.delete(card);
      }
    }
    for (const entry of cardToEntry.values()) {
      const display = this.createCardDisplay(entry.card, entry.x, entry.y, false);
      display.setDepth(baseDepth + displayCards.length);
      if (entry.isRevealed) {
        display.setData('isRevealed', true);
      }
      displayCards.push(display);
    }

    return displayCards;
  }

  // ── Async variants ──

  async animateCardsToPositionsAsync(
    cards: Phaser.GameObjects.Container[],
    positions: Array<{ x: number; y: number }>,
    duration: number,
  ): Promise<void> {
    if (cards.length === 0) return;
    const baseDepth = this.host.centerDepthCounter;
    this.host.centerDepthCounter += cards.length;
    await Promise.all(
      cards.map((card, i) => {
        card.setDepth(baseDepth + i);
        const pos = positions[i]!;
        return waitForTween(this.scene, {
          targets: card,
          x: pos.x,
          y: pos.y,
          duration,
          ease: 'Sine.easeOut',
        });
      }),
    );
  }

  async fadeOutCenterCardsAsync(): Promise<void> {
    const cards = [...this.host.centerCards];
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    if (cards.length === 0) return;
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;
    await fadeOutAndDestroy(cards, 80, this.scene);
  }

  async animateShiftAndReplaceAsync(
    oldCards: Phaser.GameObjects.Container[],
    newCards: Phaser.GameObjects.Container[],
    duration: number,
  ): Promise<void> {
    const total = oldCards.length + newCards.length;
    if (total === 0) return;

    const shiftDepth = this.host.centerDepthCounter;
    this.host.centerDepthCounter += newCards.length + oldCards.length;

    const oldPromises = oldCards.map((c, i) => {
      c.setDepth(shiftDepth + i);
      return waitForTween(this.scene, {
        targets: c,
        x: c.x - 150,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        duration,
        ease: 'Sine.easeIn',
      }).then(() => c.destroy());
    });

    const newPositions = this.getCardFanPositions(newCards.length, 1200, 475);
    const newPromises = newCards.map((card, i) => {
      card.setDepth(shiftDepth + oldCards.length + i);
      const pos = newPositions[i]!;
      return waitForTween(this.scene, {
        targets: card,
        x: pos.x,
        y: pos.y,
        duration,
        ease: 'Sine.easeOut',
      });
    });

    await Promise.all([...oldPromises, ...newPromises]);
  }

  renderEnemyHandAsync(delay: number): Promise<void> {
    return new Promise(resolve => {
      this.renderEnemyHand(true, delay, resolve);
    });
  }

  // ── Helpers ──

  createCardInteractive(card: Card, x: number, y: number, index: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = this.createCardDisplay(card, x, y, isSelected);
    container.setDepth(DEPTH_PLAYER_HAND);
    container.setData('cardIndex', index);

    return container;
  }

  updateCardShadowGlow(container: Phaser.GameObjects.Container, isGlow: boolean): void {
    const glowG = container.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
    if (!glowG) return;
    glowG.setAlpha(isGlow ? 1 : 0);
  }
}
