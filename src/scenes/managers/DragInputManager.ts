import type Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { SELECTED_OFFSET, CARD_H, CARD_W } from '../../constants/Layout';
import type { CardDisplayManager } from './CardDisplayManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface DragInputHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly input: Phaser.Input.InputPlugin;
  battle: BattleState;
  cardObjects: Phaser.GameObjects.Container[];
  selectedIndices: Set<number>;
  phase: GamePhase;
  updatePatternHint(): void;
  updateActiveSkillButton(): void;
}

export class DragInputManager {
  private host: DragInputHost;
  private cardDisplay: CardDisplayManager;

  private dragStartIndex: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragActive = false;
  private scrollActive = false;
  private lastScrollMidX = 0;
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private dragSelectMode: 'add' | 'remove' | null = null;
  private dragTouchedIndices: Set<number> = new Set();
  private dragSnapshot: Set<number> = new Set();

  constructor(host: DragInputHost, cardDisplay: CardDisplayManager) {
    this.host = host;
    this.cardDisplay = cardDisplay;
  }

  setup(): void {
    const input = this.host.input;

    // 支持双指触控（默认只有 1 个触摸 pointer）
    input.addPointer(2);

    input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.activePointers.set(pointer.id, { x: pointer.x, y: pointer.y });

      // 双指落下：取消进行中的框选（恢复快照），进入手牌滑动模式
      if (this.activePointers.size >= 2) {
        if (this.dragStartIndex !== null) {
          this.applyDragRange(null);
          this.resetDragState();
        }
        if (this.cardDisplay.isHandScrollable()) {
          this.scrollActive = true;
          this.lastScrollMidX = this.scrollMidpointX();
        }
        return;
      }

      if (!this.isPlayerTurn()) return;
      const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      if (idx === null) return;

      this.dragStartIndex = idx;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragActive = false;
      this.dragSelectMode = null;
      this.dragSnapshot = new Set(this.host.selectedIndices);
    });

    input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.activePointers.has(pointer.id)) {
        this.activePointers.set(pointer.id, { x: pointer.x, y: pointer.y });
      }

      if (this.scrollActive) {
        if (this.activePointers.size < 2) {
          this.scrollActive = false;
          return;
        }
        const midX = this.scrollMidpointX();
        this.cardDisplay.scrollHandBy(midX - this.lastScrollMidX);
        this.lastScrollMidX = midX;
        return;
      }

      if (this.dragStartIndex === null) return;
      if (!pointer.isDown) {
        this.resetDragState();
        return;
      }

      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!this.dragActive) {
        if (dist < 8) return;
        this.dragActive = true;
        this.dragSelectMode = this.host.selectedIndices.has(this.dragStartIndex) ? 'remove' : 'add';
      }

      const currentIdx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      this.applyDragRange(currentIdx);
    });

    input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.activePointers.delete(pointer.id);

      if (this.scrollActive) {
        if (this.activePointers.size < 2) {
          this.scrollActive = false;
        }
        this.resetDragState();
        return;
      }

      if (this.dragStartIndex === null) return;

      if (!this.dragActive) {
        const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
        if (idx !== null && idx === this.dragStartIndex) {
          this.onCardClick(idx);
        }
      }

      this.resetDragState();
    });

    // 电脑端：鼠标滚轮滑动手牌
    input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown, deltaX: number, deltaY: number) => {
      if (!this.cardDisplay.isHandScrollable()) return;
      const d = deltaX !== 0 ? deltaX : deltaY;
      this.cardDisplay.scrollHandBy(-d);
    });
  }

  private scrollMidpointX(): number {
    let sum = 0;
    for (const p of this.activePointers.values()) sum += p.x;
    return sum / Math.max(1, this.activePointers.size);
  }

  resetDragState(): void {
    this.dragStartIndex = null;
    this.dragActive = false;
    this.dragSelectMode = null;
    this.dragTouchedIndices.clear();
    this.dragSnapshot.clear();
  }

  private getCardIndexAtPosition(x: number, y: number): number | null {
    const hand = this.host.battle.player.hand;
    if (hand.length === 0) return null;

    const { height } = this.host.scale;
    const baseY = height - 90;
    const { startX, offset } = this.cardDisplay.getHandLayout();

    if (y < baseY - CARD_H / 2 - 10 || y > baseY + CARD_H / 2 + 10) return null;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < hand.length; i++) {
      const cx = startX + i * offset;
      const d = Math.abs(x - cx);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestDist > CARD_W / 2) return null;
    return bestIdx;
  }

  private applyDragRange(currentIdx: number | null): void {
    if (this.dragStartIndex === null || this.dragSelectMode === null) return;

    this.host.selectedIndices.clear();
    for (const idx of this.dragSnapshot) {
      this.host.selectedIndices.add(idx);
    }

    if (currentIdx !== null) {
      const minIdx = Math.min(this.dragStartIndex, currentIdx);
      const maxIdx = Math.max(this.dragStartIndex, currentIdx);
      for (let i = minIdx; i <= maxIdx; i++) {
        if (this.dragSelectMode === 'add') {
          this.host.selectedIndices.add(i);
        } else {
          this.host.selectedIndices.delete(i);
        }
      }
    }

    const { height } = this.host.scale;
    const baseY = height - 90;

    for (let i = 0; i < this.host.cardObjects.length; i++) {
      const obj = this.host.cardObjects[i]!;
      const isSelected = this.host.selectedIndices.has(i);
      const targetY = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const glowG = obj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;

      this.host.tweens.add({
        targets: obj,
        y: targetY,
        duration: 300,
        ease: 'Sine.easeOut',
      });
      if (glowG) {
        const targetAlpha = isSelected ? 1 : 0;
        this.host.tweens.add({
          targets: glowG,
          alpha: targetAlpha,
          duration: 300,
          ease: 'Sine.easeOut',
        });
      }
    }

    this.host.updatePatternHint();
    this.host.updateActiveSkillButton();
  }

  private isPlayerTurn(): boolean {
    const phase = this.host.phase;
    return phase === 'player_init' || phase === 'player_respond';
  }

  onCardClick(index: number): void {
    const phase = this.host.phase;
    if (phase === 'animating' || phase === 'game_over' || phase === 'ai_init' || phase === 'ai_respond') {
      return;
    }

    const selected = this.host.selectedIndices;
    if (selected.has(index)) {
      selected.delete(index);
    } else {
      selected.add(index);
    }

    const { height } = this.host.scale;
    const baseY = height - 90;

    const cards = this.host.cardObjects;
    for (let i = 0; i < cards.length; i++) {
      const obj = cards[i]!;
      const isSelected = selected.has(i);
      const targetY = baseY + (isSelected ? SELECTED_OFFSET : 0);
      const glowG = obj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;

      if (obj.y !== targetY) {
        this.host.tweens.add({
          targets: obj,
          y: targetY,
          duration: 300,
          ease: 'Sine.easeOut',
        });
      }

      if (glowG) {
        const targetAlpha = isSelected ? 1 : 0;
        if (glowG.alpha !== targetAlpha) {
          this.host.tweens.add({
            targets: glowG,
            alpha: targetAlpha,
            duration: 300,
            ease: 'Sine.easeOut',
          });
        }
      }
    }

    this.host.updatePatternHint();
    this.host.updateActiveSkillButton();
  }
}
