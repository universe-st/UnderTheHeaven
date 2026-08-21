import type Phaser from 'phaser';
import type { Card } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import type { CardDisplayManager } from './CardDisplayManager';
import { aiPickDefault, type HandSelectOptions } from '../../skills/HandSelect';
import { FONT_FAMILY, CARD_W, CARD_H, SELECTED_OFFSET, DEPTH_OVERLAY } from '../../constants/Layout';
import { GameAudioManager } from '../../utils/GameAudioManager';

/** 手牌基线的 Y（与 CardDisplayManager.renderPlayerHand 一致） */
const HAND_BASE_Y_OFFSET = 90;

export interface HandSelectHost {
  battle: BattleState;
  cardObjects: Phaser.GameObjects.Container[];
  selectedIndices: Set<number>;
  /** 选牌激活期间置 true：DragInputManager 据此挂起普通手牌输入 */
  handSelectActive: boolean;
}

/**
 * 公共事件「选择手牌」的执行管理器：
 * - 玩家执行：在玩家手牌区点选（filter 过滤不可选、want 满足时确认键亮），
 *   点「确定」返回选中牌、点「取消」返回 null（forced 时无取消按钮）；
 *   期间复用现有手牌容器，不创建中央临时牌，并挂起 DragInputManager 的普通手牌输入。
 * - 敌人执行：直接返回 AI 判断（aiPick 或组合枚举），无 UI、无动画。
 */
export class HandSelectManager {
  private scene: Phaser.Scene & HandSelectHost;
  private cardDisplay: CardDisplayManager;

  constructor(scene: Phaser.Scene & HandSelectHost, cardDisplay: CardDisplayManager) {
    this.scene = scene;
    this.cardDisplay = cardDisplay;
  }

  selectHandCards(options: HandSelectOptions): Promise<Card[] | null> {
    if (options.side === 'enemy') {
      // 敌人执行：直接返回 AI 的判断，没有动画
      return Promise.resolve(aiPickDefault(this.scene.battle.enemy.hand, options));
    }
    return this.pickFromPlayerHand(options);
  }

  // ── 玩家侧：手牌区交互选牌 ──

  private async pickFromPlayerHand(options: HandSelectOptions): Promise<Card[] | null> {
    const scene = this.scene;
    const hand = this.scene.battle.player.hand;
    if (hand.length === 0) return null;

    const { width, height } = scene.scale;
    const baseY = height - HAND_BASE_Y_OFFSET;
    const filter = options.filter ?? (() => true);
    const forced = options.forced ?? false;
    const selectedIdx = new Set<number>();
    const cardObjects = [...this.scene.cardObjects];

    // 选牌期间普通出牌选中快照并清空，结束后恢复（避免与选牌选中视觉混淆）
    const savedSelected = new Set(this.scene.selectedIndices);
    this.scene.selectedIndices.clear();

    // 挂起 DragInputManager 的普通手牌输入（开局 player_init 补发 ON_HAND_REFILLED
    // 时 phase 仍是 player_init，DragInput 的 onCardClick 会与选牌交互冲突）
    this.scene.handSelectActive = true;

    let ui: Phaser.GameObjects.Container | null = null;
    let onPointerDown: ((pointer: Phaser.Input.Pointer) => void) | null = null;
    let drawConfirm: (enabled: boolean) => void = () => {};

    try {
      // 不可选牌置灰
      for (let i = 0; i < cardObjects.length; i++) {
        if (!filter(hand[i]!)) cardObjects[i]!.setAlpha(0.4);
      }

      // ── UI：提示文字 + 确认/取消按钮（深度在手牌之上） ──
      ui = scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
      ui.add(
        scene.add.text(width / 2, height - 440, options.title ?? '选择手牌', {
          fontSize: '34px',
          fontFamily: FONT_FAMILY,
          fontStyle: 'bold',
          color: '#ffd700',
          stroke: '#1a0800',
          strokeThickness: 5,
        }).setOrigin(0.5),
      );

      const btnY = height - 320;
      const btnW = 250;
      const btnH = 80;
      const confirmX = width / 2 - 160;
      const cancelX = width / 2 + 160;

      const confirmBtn = scene.add.container(confirmX, btnY).setDepth(DEPTH_OVERLAY + 1);
      const confirmGfx = scene.add.graphics();
      const confirmText = scene.add.text(0, 0, '确 定', {
        fontSize: '34px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: '#1a0a04',
        stroke: '#e8dcc8',
        strokeThickness: 2,
      }).setOrigin(0.5);
      confirmBtn.add([confirmGfx, confirmText]);
      const confirmZone = scene.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
      confirmBtn.add(confirmZone);
      ui.add(confirmBtn);

      drawConfirm = (enabled: boolean): void => {
        confirmGfx.clear();
        if (enabled) {
          confirmGfx.fillStyle(0xc8a878, 1);
          confirmGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
          confirmGfx.lineStyle(1.5, 0x8a6030, 0.85);
          confirmGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
          confirmText.setColor('#1a0a04');
        } else {
          confirmGfx.fillStyle(0x6a5a4a, 0.6);
          confirmGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
          confirmGfx.lineStyle(1.5, 0x4a3a2a, 0.5);
          confirmGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
          confirmText.setColor('#8a7a60');
        }
      };
      // 初始即按空选结果绘制背景（否则按钮直到首次点牌才有背景）
      drawConfirm(options.want([]));

      let cancelZone: Phaser.GameObjects.Zone | null = null;
      if (!forced) {
        const cancelBtn = scene.add.container(cancelX, btnY).setDepth(DEPTH_OVERLAY + 1);
        const cancelGfx = scene.add.graphics();
        cancelGfx.fillStyle(0x3a2a2a, 1);
        cancelGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
        cancelGfx.lineStyle(2, 0xc8a080, 0.8);
        cancelGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
        const cancelText = scene.add.text(0, 0, '取 消', {
          fontSize: '34px',
          fontFamily: FONT_FAMILY,
          fontStyle: 'bold',
          color: '#d8b898',
          stroke: '#1a0a2a',
          strokeThickness: 2,
        }).setOrigin(0.5);
        cancelBtn.add([cancelGfx, cancelText]);
        cancelZone = scene.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
        cancelBtn.add(cancelZone);
        ui.add(cancelBtn);
      }

      const getSelectedCards = (): Card[] =>
        [...selectedIdx].sort((a, b) => a - b)
          .map(i => hand[i]!)
          .filter((c): c is Card => c !== undefined);

      // 选中视觉：卡片上移 + 金色光晕；并刷新确认键亮/灰
      const applySelection = (): void => {
        for (let i = 0; i < cardObjects.length; i++) {
          const obj = cardObjects[i]!;
          const isSel = selectedIdx.has(i);
          scene.tweens.killTweensOf(obj);
          const targetY = baseY + (isSel ? SELECTED_OFFSET : 0);
          if (obj.y !== targetY) {
            scene.tweens.add({ targets: obj, y: targetY, duration: 150, ease: 'Sine.easeOut' });
          }
          const glowG = obj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
          if (glowG) {
            scene.tweens.killTweensOf(glowG);
            scene.tweens.add({ targets: glowG, alpha: isSel ? 1 : 0, duration: 150, ease: 'Sine.easeOut' });
          }
        }
        drawConfirm(options.want(getSelectedCards()));
      };

      // 手牌命中（与 DragInputManager 同布局算法；选中上移的牌仍可点击，放宽上界）
      const getCardIndexAt = (x: number, y: number): number | null => {
        if (hand.length === 0) return null;
        const { startX, offset } = this.cardDisplay.getHandLayout();
        if (y < baseY - CARD_H / 2 - 70 || y > baseY + CARD_H / 2 + 10) return null;
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
      };

      onPointerDown = (pointer: Phaser.Input.Pointer): void => {
        const idx = getCardIndexAt(pointer.x, pointer.y);
        if (idx === null) return;
        if (!filter(hand[idx]!)) return;
        if (selectedIdx.has(idx)) {
          selectedIdx.delete(idx);
        } else {
          selectedIdx.add(idx);
        }
        applySelection();
      };
      scene.input.on('pointerdown', onPointerDown);

      return await new Promise<Card[] | null>(resolve => {
        confirmZone.on('pointerdown', () => {
          const sel = getSelectedCards();
          if (options.want(sel)) {
            GameAudioManager.playSfx(scene, 'sfx_button');
            resolve(sel);
          }
        });
        cancelZone?.on('pointerdown', () => {
          GameAudioManager.playSfx(scene, 'sfx_button');
          resolve(null);
        });
      });
    } finally {
      // ── 清理：解除挂起、移除输入监听、销毁 UI、恢复手牌视觉与出牌选中 ──
      this.scene.handSelectActive = false;
      if (onPointerDown) scene.input.off('pointerdown', onPointerDown);
      ui?.destroy();
      this.scene.selectedIndices = savedSelected;
      for (let i = 0; i < cardObjects.length; i++) {
        const obj = cardObjects[i]!;
        const isSel = savedSelected.has(i);
        obj.setAlpha(1);
        scene.tweens.killTweensOf(obj);
        scene.tweens.add({
          targets: obj,
          y: baseY + (isSel ? SELECTED_OFFSET : 0),
          duration: 150,
          ease: 'Sine.easeOut',
        });
        const glowG = obj.getData('_glowG') as Phaser.GameObjects.Graphics | undefined;
        if (glowG) {
          scene.tweens.killTweensOf(glowG);
          scene.tweens.add({ targets: glowG, alpha: isSel ? 1 : 0, duration: 150, ease: 'Sine.easeOut' });
        }
      }
    }
  }
}
