import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { CARD_W, CARD_H, SELECTED_OFFSET } from '../../constants/Layout';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface DragInputHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly input: { on: Phaser.Input.InputPlugin['on'] };
  battle: BattleState;
  cardObjects: Phaser.GameObjects.Container[];
  selectedIndices: Set<number>;
  phase: GamePhase;
  onCardClick(index: number): void;
  updatePatternHint(): void;
  updateActiveSkillButton(): void;
}

export class DragInputManager {
  private host: DragInputHost;

  private dragStartIndex: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragActive = false;
  private dragSelectMode: 'add' | 'remove' | null = null;
  private dragTouchedIndices: Set<number> = new Set();
  private dragSnapshot: Set<number> = new Set();

  constructor(host: DragInputHost) {
    this.host = host;
  }

  setup(): void {
    const input = this.host.input as Phaser.Input.InputPlugin;

    input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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
      if (this.dragStartIndex === null) return;
      if (!pointer.isDown) {
        this.resetDragState();
        return;
      }

      const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.dragStartX, this.dragStartY);
      if (!this.dragActive && dist < 8) return;

      if (!this.dragActive) {
        this.dragActive = true;
        this.dragSelectMode = this.host.selectedIndices.has(this.dragStartIndex) ? 'remove' : 'add';
      }

      const currentIdx = this.getCardIndexAtPosition(pointer.x, pointer.y);
      this.applyDragRange(currentIdx);
    });

    input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragStartIndex === null) return;

      if (!this.dragActive) {
        const idx = this.getCardIndexAtPosition(pointer.x, pointer.y);
        if (idx !== null && idx === this.dragStartIndex) {
          this.host.onCardClick(idx);
        }
      }

      this.resetDragState();
    });
  }

  resetDragState(): void {
    this.dragStartIndex = null;
    this.dragActive = false;
    this.dragSelectMode = null;
    this.dragTouchedIndices.clear();
    this.dragSnapshot.clear();
  }

  private applyDragRange(currentIdx: number | null): void {
    if (this.dragStartIndex === null || this.dragSelectMode === null) return;

    this.host.selectedIndices = new Set(this.dragSnapshot);

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

  private getCardIndexAtPosition(x: number, y: number): number | null {
    const hand = this.host.battle.player.hand;
    if (hand.length === 0) return null;

    const { width, height } = this.host.scale;
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
    const phase = this.host.phase;
    return phase === 'player_init' || phase === 'player_respond';
  }
}