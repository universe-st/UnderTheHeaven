import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import type { PlayerCharacterId } from '../../models/Character';
import { PLAYER_CHARACTERS } from '../../models/Character';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { waitForTween } from '../../utils/AnimationUtils';
import type { CharacterSlotManager } from '../../skills';
import type { CharacterInfoManager } from './CharacterInfoManager';
import {
  FONT_FAMILY, AVATAR_SOURCE_SIZE,
  SLOT_SIZE, SLOT_GAP, SLOT_STRIDE,
  VISIBLE_BAR_WIDTH, FADE_WIDTH,
  DEPTH_UI, DEPTH_DAMAGE,
} from '../../constants/Layout';

export interface CharacterBarHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly time: Phaser.Time.Clock;
  readonly input: Phaser.Input.InputPlugin;

  battle: BattleState;
  playerCharacterIds: PlayerCharacterId[];

  characterSlotContainers: Phaser.GameObjects.Container[];
  characterSlotTexts: Phaser.GameObjects.Text[];

  characterBarContainer: Phaser.GameObjects.Container | null;
  characterBarMaskShape: Phaser.GameObjects.Graphics | null;
  characterBarScrollX: number;
  characterBarMaxScroll: number;
  characterBarDragging: boolean;
  barDragStartPointerX: number;
  barDragStartScrollX: number;
  barDragPending: boolean;
  barDragMoved: boolean;

  skillTriggeredCharacters: Set<PlayerCharacterId>;
  characterSlotGlows: {
    innerGlow: Phaser.GameObjects.Graphics;
    midGlow: Phaser.GameObjects.Graphics;
    outerGlow: Phaser.GameObjects.Graphics;
    sweepGfx: Phaser.GameObjects.Graphics;
  }[];
  characterSlotGlowTweens: Map<number, Phaser.Tweens.Tween[]>;

  enemyAvatarImage: Phaser.GameObjects.Image;
}

export class CharacterBarManager implements CharacterSlotManager {
  private host: CharacterBarHost & Phaser.Scene;
  private characterInfo: CharacterInfoManager;

  constructor(host: CharacterBarHost & Phaser.Scene, characterInfo: CharacterInfoManager) {
    this.host = host;
    this.characterInfo = characterInfo;
  }

  createCharacterSlots(_w: number, _h: number): void {
    const slotCount = Math.max(1, this.host.playerCharacterIds.length);
    const origin = this.getCharacterBarOrigin();

    const maskShape = this.host.add.graphics();
    maskShape.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 1, 0, 1);
    maskShape.fillRect(origin.x, origin.y - SLOT_SIZE, FADE_WIDTH, SLOT_SIZE * 3);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(origin.x + FADE_WIDTH, origin.y - SLOT_SIZE, VISIBLE_BAR_WIDTH - 2 * FADE_WIDTH, SLOT_SIZE * 3);
    maskShape.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 1, 0, 1, 0);
    maskShape.fillRect(origin.x + VISIBLE_BAR_WIDTH - FADE_WIDTH, origin.y - SLOT_SIZE, FADE_WIDTH, SLOT_SIZE * 3);
    maskShape.setDepth(-10000);
    this.host.characterBarMaskShape = maskShape;

    const barContainer = this.host.add.container(origin.x, origin.y).setDepth(DEPTH_UI);
    barContainer.enableFilters();
    const maskFilter = barContainer.filters!.internal.addMask(maskShape);
    maskFilter.autoUpdate = false;
    this.host.characterBarContainer = barContainer;

    for (let i = 0; i < slotCount; i++) {
      const pos = this.getSlotPosition(i);
      const container = this.host.add.container(pos.x, pos.y);
      this.host.characterSlotContainers.push(container);

      const glowContainer = this.host.add.container(0, 0).setAlpha(0);
      container.addAt(glowContainer, 0);

      const innerGlow = this.host.add.graphics();
      innerGlow.fillStyle(0xffd700, 0.5);
      innerGlow.fillRoundedRect(-SLOT_SIZE / 2 + 2, -SLOT_SIZE / 2 + 2, SLOT_SIZE - 4, SLOT_SIZE - 4, 7);
      glowContainer.add(innerGlow);

      const midGlow = this.host.add.graphics();
      midGlow.fillStyle(0xffaa00, 0.3);
      midGlow.fillRoundedRect(-SLOT_SIZE / 2 - 4, -SLOT_SIZE / 2 - 4, SLOT_SIZE + 8, SLOT_SIZE + 8, 9);
      glowContainer.add(midGlow);

      const outerGlow = this.host.add.graphics();
      outerGlow.fillStyle(0xffd700, 0.12);
      outerGlow.fillRoundedRect(-SLOT_SIZE / 2 - 10, -SLOT_SIZE / 2 - 10, SLOT_SIZE + 20, SLOT_SIZE + 20, 11);
      glowContainer.add(outerGlow);

      const sweepGfx = this.host.add.graphics();
      sweepGfx.fillGradientStyle(0xffd700, 0xffd700, 0xffd700, 0xffd700, 0.35, 0.35, 0, 0);
      sweepGfx.fillRoundedRect(-SLOT_SIZE / 2 - 6, -SLOT_SIZE / 2 - 6, SLOT_SIZE + 12, 8, 4);
      glowContainer.add(sweepGfx);

      this.host.characterSlotGlows.push({ innerGlow, midGlow, outerGlow, sweepGfx });

      const gfx = this.host.add.graphics();
      gfx.fillStyle(0x2a1a0f, 0.7);
      gfx.fillRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
      gfx.lineStyle(2, 0xb89040, 0.6);
      gfx.strokeRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
      gfx.lineStyle(1, 0x5a4030, 0.3);
      gfx.strokeRoundedRect(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, 6);
      container.add(gfx);

      const charId = this.host.playerCharacterIds[i] ?? null;
      const char = charId ? PLAYER_CHARACTERS[charId] : null;

      if (charId) {
        const avatar = this.host.add.image(0, 0, `char_${charId}`);
        avatar.setScale((SLOT_SIZE - 8) / AVATAR_SOURCE_SIZE);
        container.add(avatar);
      }

      const slotText = this.host.add.text(0, SLOT_SIZE / 2 + 18, char ? char.name : '?', {
        fontSize: char ? '28px' : '42px',
        fontFamily: FONT_FAMILY,
        color: char ? '#c8a050' : '#5a4030',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setShadow(0, 2, '#1a0800', 4, true, true);
      container.add(slotText);
      this.host.characterSlotTexts.push(slotText);

      const zone = this.host.add.zone(0, 0, SLOT_SIZE + 8, SLOT_SIZE + 8)
        .setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => {
        gfx.clear();
        gfx.fillStyle(0x3a2510, 0.8);
        gfx.fillRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(2, 0xe8d5a3, 0.8);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(1, 0x5a4030, 0.3);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, 6);
      });
      zone.on('pointerout', () => {
        gfx.clear();
        gfx.fillStyle(0x2a1a0f, 0.7);
        gfx.fillRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(2, 0xb89040, 0.6);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8);
        gfx.lineStyle(1, 0x5a4030, 0.3);
        gfx.strokeRoundedRect(-SLOT_SIZE / 2 + 4, -SLOT_SIZE / 2 + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, 6);
      });
      this.attachSlotDragAndClick(zone, charId as PlayerCharacterId | null);
      container.add(zone);

      const cornerGfx = this.host.add.graphics();
      const cornerLen = 12;
      const cornerGap = 6;
      cornerGfx.lineStyle(1.5, 0xb89040, 0.4);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen, -SLOT_SIZE / 2 + cornerGap);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen, -SLOT_SIZE / 2 + cornerGap);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen);
      cornerGfx.lineBetween(-SLOT_SIZE / 2 + cornerGap, SLOT_SIZE / 2 - cornerGap, -SLOT_SIZE / 2 + cornerGap + cornerLen, SLOT_SIZE / 2 - cornerGap);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen);
      cornerGfx.lineBetween(SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap, SLOT_SIZE / 2 - cornerGap - cornerLen, SLOT_SIZE / 2 - cornerGap);
      container.add(cornerGfx);

      barContainer.add(container);
    }

    const totalSlotsWidth = slotCount * SLOT_STRIDE - SLOT_GAP;
    this.host.characterBarMaxScroll = Math.min(0, VISIBLE_BAR_WIDTH - 2 * FADE_WIDTH - totalSlotsWidth);

    this.setCharacterBarScroll(0);
  }

  private attachSlotDragAndClick(zone: Phaser.GameObjects.Zone, zoneCharId: PlayerCharacterId | null): void {
    this.host.input.setDraggable(zone);
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.host.characterBarDragging) return;
      this.host.barDragPending = true;
      this.host.barDragMoved = false;
      this.host.barDragStartPointerX = pointer.x;
      this.host.barDragStartScrollX = this.host.characterBarScrollX;
    });
    zone.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.host.barDragPending || this.host.characterBarDragging) return;
      const dx = pointer.x - this.host.barDragStartPointerX;
      if (!this.host.barDragMoved && Math.abs(dx) > 5) this.host.barDragMoved = true;
      if (this.host.barDragMoved) {
        this.setCharacterBarScroll(this.host.barDragStartScrollX + dx);
      }
    });
    zone.on('pointerup', () => {
      const wasMoved = this.host.barDragMoved;
      this.host.barDragPending = false;
      this.host.barDragMoved = false;
      if (wasMoved) return;
      if (!zoneCharId) return;
      const idx = this.host.playerCharacterIds.indexOf(zoneCharId);
      if (idx < 0 || !this.isSlotVisible(idx)) return;
      GameAudioManager.playSfx(this.host, 'sfx_button');
      this.characterInfo.showCharacterTooltip(idx);
    });
  }

  private setCharacterBarScroll(x: number): void {
    if (!this.host.characterBarContainer) return;
    if (this.host.characterBarMaxScroll >= 0) {
      this.host.characterBarScrollX = 0;
    } else {
      this.host.characterBarScrollX = Phaser.Math.Clamp(x, this.host.characterBarMaxScroll, 0);
    }
    const origin = this.getCharacterBarOrigin();
    this.host.characterBarContainer.x = origin.x + this.host.characterBarScrollX;
  }

  private isSlotVisible(slotIndex: number): boolean {
    if (!this.host.characterBarContainer) return false;
    const origin = this.getCharacterBarOrigin();
    const container = this.host.characterSlotContainers[slotIndex];
    if (!container) return false;
    const worldCenterX = this.host.characterBarContainer.x + container.x;
    const slotHalf = SLOT_SIZE / 2;
    return worldCenterX + slotHalf > origin.x && worldCenterX - slotHalf < origin.x + VISIBLE_BAR_WIDTH;
  }

  private async resetCharacterBarScroll(): Promise<void> {
    if (this.host.characterBarScrollX === 0 || !this.host.characterBarContainer) {
      this.setCharacterBarScroll(0);
      return;
    }
    this.host.characterBarDragging = true;
    await waitForTween(this.host, {
      targets: this.host,
      characterBarScrollX: 0,
      duration: 200,
      ease: 'Sine.easeOut',
      onUpdate: () => this.setCharacterBarScroll(this.host.characterBarScrollX),
    });
    this.host.characterBarDragging = false;
  }

  isPlayerCharacter(characterId: string): boolean {
    return this.host.playerCharacterIds.includes(characterId as PlayerCharacterId);
  }

  getCharacterOrder(characterId: string): number {
    const idx = this.host.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx >= 0) return idx;
    if (characterId === this.host.battle?.enemyCharacterId) return 999;
    return 999;
  }

  showDialog(characterId: string, text: string): void {
    if (!text) return;

    const h = this.host;
    const lines = this.wrapDialogText(text, 15);
    const fontSize = 22;
    const padX = 16;
    const padY = 12;

    let anchorX: number;
    let anchorY: number;
    const tailDir: 'up' | 'down' = h.playerCharacterIds.includes(characterId as PlayerCharacterId) ? 'down' : 'up';

    if (tailDir === 'down') {
      const idx = h.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
      if (idx < 0 || idx >= h.characterSlotContainers.length) return;
      const slot = h.characterSlotContainers[idx]!;
      const barX = h.characterBarContainer ? h.characterBarContainer.x : 0;
      const barY = h.characterBarContainer ? h.characterBarContainer.y : 0;
      anchorX = slot.x + barX;
      anchorY = slot.y + barY - 140;
    } else {
      anchorX = 54;
      anchorY = 160;
    }

    const container = h.add.container(anchorX, anchorY).setDepth(DEPTH_DAMAGE - 5).setAlpha(0);

    const textObj = h.add.text(0, 0, lines.join('\n'), {
      fontSize: `${fontSize}px`,
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5, 0);

    const textW = textObj.width;
    const textH = textObj.height;
    const boxW = Math.max(textW + padX * 2, 80);
    const boxH = Math.max(textH + padY * 2, 40);
    const totalH = boxH + 10;

    const tailSize = 8;
    const graphicsTop = tailDir === 'down' ? 0 : tailSize;
    const textY = tailDir === 'down' ? padY + 5 : padY + tailSize + 5;

    const gfx = h.add.graphics();
    gfx.fillStyle(0xfffdf5, 0.95);
    gfx.fillRoundedRect(-boxW / 2, graphicsTop, boxW, boxH, 10);
    if (tailDir === 'down') {
      gfx.fillTriangle(-tailSize, boxH, tailSize, boxH, 0, totalH);
    } else {
      gfx.fillTriangle(-tailSize, tailSize, tailSize, tailSize, 0, 0);
    }
    gfx.lineStyle(2, 0x6a4a2a, 0.7);
    gfx.strokeRoundedRect(-boxW / 2, graphicsTop, boxW, boxH, 10);
    if (tailDir === 'down') {
      gfx.lineBetween(-tailSize, boxH, 0, totalH);
      gfx.lineBetween(tailSize, boxH, 0, totalH);
    } else {
      gfx.lineBetween(-tailSize, tailSize, 0, 0);
      gfx.lineBetween(tailSize, tailSize, 0, 0);
    }
    container.add(gfx);

    textObj.setY(textY);
    container.add(textObj);

    h.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        h.time.delayedCall(2200, () => {
          h.tweens.add({
            targets: container,
            alpha: 0,
            duration: 400,
            ease: 'Sine.easeIn',
            onComplete: () => container.destroy(),
          });
        });
      },
    });
  }

  private wrapDialogText(text: string, maxPerLine: number): string[] {
    const lines: string[] = [];
    let current = '';
    for (const ch of text) {
      current += ch;
      if (current.length >= maxPerLine) {
        lines.push(current);
        current = '';
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [text];
  }

  async glowOn(characterId: string): Promise<void> {
    const h = this.host;
    const idx = h.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx === -1) return;
    await this.resetCharacterBarScroll();
    h.skillTriggeredCharacters.add(characterId as PlayerCharacterId);

    const container = h.characterSlotContainers[idx];
    if (!container) return;
    const glowContainer = container.getAt(0);
    if (!(glowContainer instanceof Phaser.GameObjects.Container)) return;

    h.tweens.killTweensOf(glowContainer);
    glowContainer.setAlpha(0);
    glowContainer.setScale(1);

    const glowEls = h.characterSlotGlows[idx];
    if (glowEls) {
      h.tweens.killTweensOf(glowEls.sweepGfx);
      glowEls.sweepGfx.setY(0);
    }

    await waitForTween(h, {
      targets: glowContainer,
      alpha: { from: 0, to: 1 },
      duration: 200,
      ease: 'Sine.easeOut',
    });

    const tweens: Phaser.Tweens.Tween[] = [];
    tweens.push(h.tweens.add({
      targets: glowContainer,
      alpha: { from: 0.7, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }));
    tweens.push(h.tweens.add({
      targets: glowContainer,
      scaleX: { from: 1, to: 1.06 },
      scaleY: { from: 1, to: 1.06 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }));
    if (glowEls) {
      const halfSlot = 64;
      tweens.push(h.tweens.add({
        targets: glowEls.sweepGfx,
        y: { from: -halfSlot, to: halfSlot },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }));
    }
    h.characterSlotGlowTweens.set(idx, tweens);
  }

  async shakeAndPulse(characterId: string): Promise<void> {
    const h = this.host;
    const idx = h.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx === -1) return;
    const container = h.characterSlotContainers[idx];
    if (!container) return;

    const origX = container.x;
    const shakeOffsets = [-8, 8, -8, 8, 0];
    const stepMs = 30;
    const scaleTo = 1.15;

    const shakePromise = (async () => {
      for (const offset of shakeOffsets) {
        await waitForTween(h, {
          targets: container,
          x: origX + offset,
          duration: stepMs,
          ease: 'Linear',
        });
      }
    })();

    const scaleUpPromise = waitForTween(h, {
      targets: container,
      scaleX: scaleTo,
      scaleY: scaleTo,
      duration: shakeOffsets.length * stepMs,
      ease: 'Sine.easeOut',
    });

    await Promise.all([shakePromise, scaleUpPromise]);

    await waitForTween(h, {
      targets: container,
      scaleX: 1.0,
      scaleY: 1.0,
      x: origX,
      duration: 150,
      ease: 'Sine.easeIn',
    });
  }

  async glowOff(characterId: string): Promise<void> {
    const h = this.host;
    const idx = h.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx === -1) return;
    h.skillTriggeredCharacters.delete(characterId as PlayerCharacterId);

    const container = h.characterSlotContainers[idx];
    if (!container) return;
    const glowContainer = container.getAt(0);
    if (!(glowContainer instanceof Phaser.GameObjects.Container)) return;

    const existingTweens = h.characterSlotGlowTweens.get(idx);
    if (existingTweens) {
      for (const t of existingTweens) t.stop();
      h.characterSlotGlowTweens.delete(idx);
    }

    await waitForTween(h, {
      targets: glowContainer,
      alpha: 0,
      duration: 300,
      ease: 'Sine.easeOut',
    });
  }

  async moveToFront(characterId: string): Promise<void> {
    const h = this.host;
    const idx = h.playerCharacterIds.indexOf(characterId as PlayerCharacterId);
    if (idx <= 0) return;

    const triggeredChars = new Set(h.skillTriggeredCharacters);
    for (const [, tweens] of h.characterSlotGlowTweens) {
      for (const t of tweens) t.stop();
    }
    h.characterSlotGlowTweens.clear();
    for (const c of h.characterSlotContainers) {
      h.tweens.killTweensOf(c);
    }

    h.playerCharacterIds.splice(idx, 1);
    h.playerCharacterIds.unshift(characterId as PlayerCharacterId);

    const movedContainer = h.characterSlotContainers.splice(idx, 1)[0]!;
    h.characterSlotContainers.unshift(movedContainer);

    const movedGlowEls = h.characterSlotGlows.splice(idx, 1)[0]!;
    h.characterSlotGlows.unshift(movedGlowEls);

    const movedText = h.characterSlotTexts.splice(idx, 1)[0]!;
    h.characterSlotTexts.unshift(movedText);

    const slotTweens: Promise<void>[] = [];
    for (let i = 0; i <= idx; i++) {
      const targetPos = this.getSlotPosition(i);
      slotTweens.push(waitForTween(h, {
        targets: h.characterSlotContainers[i]!,
        x: targetPos.x,
        duration: 300,
        ease: 'Sine.easeOut',
      }));
    }
    await Promise.all(slotTweens);

    for (const cid of triggeredChars) {
      const newIdx = h.playerCharacterIds.indexOf(cid);
      if (newIdx >= 0) {
        const glowEls = h.characterSlotGlows[newIdx];
        if (!glowEls) continue;
        const gc = h.characterSlotContainers[newIdx]?.getAt(0);
        if (!(gc instanceof Phaser.GameObjects.Container)) continue;
        await this.glowOn(cid);
      }
    }
  }

  async restoreSlot(_characterId: string): Promise<void> {
  }

  private getSlotPosition(index: number): { x: number; y: number } {
    return { x: SLOT_SIZE / 2 + FADE_WIDTH + index * SLOT_STRIDE, y: 0 };
  }

  private getCharacterBarOrigin(): { x: number; y: number } {
    return { x: this.host.scale.width - 180 - VISIBLE_BAR_WIDTH, y: this.host.scale.height - 420 };
  }
}
