import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { sortPlayedCards } from '../../models/Card';
import { createPokerCardVisual } from '../../utils/CardVisual';
import { waitForTween, fadeOutAndDestroy } from '../../utils/AnimationUtils';
import { UIFactory } from '../../utils/UIFactory';
import { CardShatterManager } from './CardShatterManager';
import { calcHandLayout, calcHandStartX, ENEMY_HAND_MIN_OFFSET } from '../../engine/handLayout';
import {
  FONT_FAMILY, CARD_W, CARD_H, CARD_OVERLAP_OFFSET, SELECTED_OFFSET,
  HAND_AREA_MARGIN,
  DEPTH_PLAYER_HAND, DEPTH_ENEMY_HAND, DEPTH_CENTER_BASE,
} from '../../constants/Layout';

/** 敌方手牌压缩下限（仅展示、无交互，可比玩家侧压得更小；不启用滑动） */
const ENEMY_MIN_OFFSET = ENEMY_HAND_MIN_OFFSET;

export interface CardDisplayHost {  readonly scale: Phaser.Scale.ScaleManager;
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
  handScrollX: number;
  revealedEnemyCards: Set<Card>;
  isTestMode: boolean;
}

export class CardDisplayManager {
  private host: CardDisplayHost;
  private scene: Phaser.Scene;
  private shatterManager: CardShatterManager;

  constructor(host: CardDisplayHost & Phaser.Scene) {
    this.host = host;
    this.scene = host;
    this.shatterManager = new CardShatterManager(host);
  }

  createCardDisplay(card: Card, x: number, y: number, isSelected: boolean = false): Phaser.GameObjects.Container {
    const container = createPokerCardVisual(this.scene, card, x, y);
    const halfW = CARD_W / 2;
    const halfH = CARD_H / 2;

    // 选中光晕：插到卡面之下、阴影之上（与旧实现同层序）
    const glowG = this.host.add.graphics();
    container.addAt(glowG, 1);
    container.setData('_glowG', glowG);
    glowG.fillStyle(0xffd700, 0.30);
    glowG.fillRoundedRect(-halfW - 4, -halfH - 4, CARD_W + 8, CARD_H + 8, 10);
    glowG.fillStyle(0xffd700, 0.18);
    glowG.fillRoundedRect(-halfW - 9, -halfH - 9, CARD_W + 18, CARD_H + 18, 12);
    glowG.fillStyle(0xffd700, 0.09);
    glowG.fillRoundedRect(-halfW - 15, -halfH - 15, CARD_W + 30, CARD_H + 30, 14);
    glowG.setAlpha(isSelected ? 1 : 0);

    if (card.isTemp) {
      const spiderGfx = this.host.add.graphics();
      UIFactory.drawSpiderWeb(spiderGfx, CARD_W, CARD_H);
      spiderGfx.setAlpha(0.4);
      container.add(spiderGfx);
    }

    return container;
  }

  renderAllCards(): void {
    this.renderPlayerHand(true);
    this.renderEnemyHand(true);
  }

  getHandLayout(): { startX: number; offset: number; scrollable: boolean } {
    const hand = this.host.battle.player.hand;
    const { width } = this.host.scale;
    const available = width - HAND_AREA_MARGIN * 2;
    const result = calcHandStartX(
      hand.length,
      width,
      available,
      CARD_OVERLAP_OFFSET,
      CARD_W,
      this.host.handScrollX,
      undefined,
      HAND_AREA_MARGIN,
    );
    this.host.handScrollX = result.scrollX;
    return { startX: result.startX, offset: result.offset, scrollable: result.scrollable };
  }

  isHandScrollable(): boolean {
    const hand = this.host.battle.player.hand;
    const { width } = this.host.scale;
    return calcHandLayout(hand.length, width - HAND_AREA_MARGIN * 2, CARD_OVERLAP_OFFSET, CARD_W).scrollable;
  }

  scrollHandBy(dx: number): void {
    const hand = this.host.battle.player.hand;
    const { width } = this.host.scale;
    const available = width - HAND_AREA_MARGIN * 2;
    const layout = calcHandLayout(hand.length, available, CARD_OVERLAP_OFFSET, CARD_W);
    if (!layout.scrollable) return;
    const minScroll = available - layout.totalWidth;
    this.host.handScrollX = Phaser.Math.Clamp(this.host.handScrollX + dx, minScroll, 0);
    this.applyHandPositions();
    this.updateHandOverflowHints();
  }

  applyHandPositions(): void {
    const { startX, offset } = this.getHandLayout();
    for (let i = 0; i < this.host.cardObjects.length; i++) {
      this.host.cardObjects[i]!.setX(startX + i * offset);
    }
  }

  /** 溢出滑动模式下显示两端渐隐提示；非溢出时隐藏 */
  updateHandOverflowHints(): void {
    const { width, height } = this.host.scale;
    const scrollable = this.isHandScrollable();

    if (!this.handFadeLeft) {
      this.handFadeLeft = this.host.add.graphics().setDepth(DEPTH_PLAYER_HAND + 500);
      this.handFadeLeft.fillGradientStyle(0x1a0f08, 0x1a0f08, 0x1a0f08, 0x1a0f08, 0.85, 0, 0.85, 0);
      this.handFadeLeft.fillRect(0, height - 260, 90, 260);
      this.handFadeRight = this.host.add.graphics().setDepth(DEPTH_PLAYER_HAND + 500);
      this.handFadeRight.fillGradientStyle(0x1a0f08, 0x1a0f08, 0x1a0f08, 0x1a0f08, 0, 0.85, 0, 0.85);
      this.handFadeRight.fillRect(width - 90, height - 260, 90, 260);
    }

    const minScroll = (width - HAND_AREA_MARGIN * 2) -
      calcHandLayout(this.host.battle.player.hand.length, width - HAND_AREA_MARGIN * 2, CARD_OVERLAP_OFFSET, CARD_W).totalWidth;
    const showLeft = scrollable && this.host.handScrollX < -1;
    const showRight = scrollable && this.host.handScrollX > minScroll + 1;
    this.handFadeLeft!.setVisible(showLeft);
    this.handFadeRight!.setVisible(showRight);
  }

  renderPlayerHand(animateEntry: boolean = false): void {
    this.host.cardObjects.forEach(c => c.destroy());
    this.host.cardObjects = [];

    const hand = this.host.battle.player.hand;
    const { width, height } = this.host.scale;
    const baseY = height - 90;
    const { startX, offset } = this.getHandLayout();
    const offscreenX = width + CARD_W;

    for (let i = 0; i < hand.length; i++) {
      const targetX = startX + i * offset;
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

    this.updateHandOverflowHints();
  }

  /** 敌方手牌布局：超宽时压缩间距（下限 ENEMY_MIN_OFFSET），整列居中 */
  getEnemyHandLayout(): { startX: number; offset: number } {
    const hand = this.host.battle.enemy.hand;
    const { width } = this.host.scale;
    const available = width - HAND_AREA_MARGIN * 2;
    const layout = calcHandLayout(hand.length, available, CARD_OVERLAP_OFFSET, CARD_W, ENEMY_MIN_OFFSET);
    const startX = (width - layout.totalWidth) / 2 + CARD_W / 2;
    return { startX, offset: layout.offset };
  }

  renderEnemyHand(animateEntry: boolean = false, baseDelay: number = 700, onComplete?: () => void): void {
    this.host.enemyCardObjects.forEach(c => c.destroy());
    this.host.enemyCardObjects = [];

    const hand = this.host.battle.enemy.hand;
    const baseY = 220;
    const { startX, offset: overlapOffset } = this.getEnemyHandLayout();

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
      container.setData('score', hc.score);
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
      } else if (this.host.isTestMode) {
        const testDisplay = this.createCardDisplay(hand[i]!, 0, 0, false);
        testDisplay.setAlpha(0.45);
        testDisplay.setScale(0.75);
        container.add(testDisplay);
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
    const gap = CARD_OVERLAP_OFFSET;
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

  private patternLabel: Phaser.GameObjects.Container | null = null;
  private handFadeLeft: Phaser.GameObjects.Graphics | null = null;
  private handFadeRight: Phaser.GameObjects.Graphics | null = null;

  showPatternLabel(label: string, isBomb: boolean): void {
    this.clearPatternLabel();
    const text = this.host.add.text(0, 0, label, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: isBomb ? '#ffd090' : '#ffe9c0',
    }).setOrigin(0.5);
    const padX = 26;
    const padY = 10;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    const bg = this.host.add.graphics();
    bg.fillStyle(isBomb ? 0x8a2a10 : 0x8a5a20, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(1.5, 0xe8c880, 0.7);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const container = this.host.add.container(1200, 370, [bg, text])
      .setDepth(DEPTH_CENTER_BASE + 300)
      .setAlpha(0)
      .setScale(0.8);
    this.patternLabel = container;
    this.host.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.host.tweens.add({
          targets: container,
          alpha: 0,
          duration: 400,
          delay: 1800,
          ease: 'Sine.easeIn',
          onComplete: () => this.clearPatternLabel(),
        });
      },
    });
  }

  clearPatternLabel(): void {
    this.patternLabel?.destroy();
    this.patternLabel = null;
  }

  clearCenterCards(): void {
    this.clearPatternLabel();
    for (const c of this.host.centerCards) {
      c.destroy();
    }
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;
  }

  fadeOutCenterCards(onComplete: () => void): void {
    this.clearPatternLabel();
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

    for (let ci = 0; ci < oldCards.length; ci++) {
      const c = oldCards[ci]!;
      c.setDepth(shiftDepth + ci);
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
          const { startX, offset } = this.getEnemyHandLayout();
          x = startX + idx * offset;
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
    this.clearPatternLabel();
    const cards = [...this.host.centerCards];
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    if (cards.length === 0) return;
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;
    const tempCards = cards.filter(c => c.getData('isTemp') === true);
    const normalCards = cards.filter(c => c.getData('isTemp') !== true);
    if (tempCards.length > 0) {
      // 先等临时牌碎裂动画播完，残影保持静止；随后残影与其它牌一起淡出消失
      await this.shatterManager.shatterCardsAsync(tempCards);
      await fadeOutAndDestroy([...normalCards, ...tempCards], 80, this.scene);
    } else {
      await fadeOutAndDestroy(cards, 80, this.scene);
    }
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

    // 被顶掉的旧牌中：临时牌碎裂并留下半透明残影（不阻塞替换动画），碎片播完后残影自行淡出
    const tempOld = oldCards.filter(c => c.getData('isTemp') === true);
    const normalOld = oldCards.filter(c => c.getData('isTemp') !== true);
    if (tempOld.length > 0) {
      void this.shatterManager.shatterCardsAsync(tempOld).then(() =>
        fadeOutAndDestroy(tempOld, 120, this.scene),
      );
    }
    const oldPromises = normalOld.map((c, i) => {
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
    this.scene.tweens.killTweensOf(glowG);
    glowG.setAlpha(isGlow ? 1 : 0);
  }
}
