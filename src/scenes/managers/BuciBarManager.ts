/**
 * 卜辞栏（六十四卦）跨三场景共享组件。
 * 3 格；点击卦象露出「使用」「出售」小标签；被动卦只有「出售」。
 * 使用权限：主动卦在黄金台（shop）或战斗主动技阶段（battle + battleActivePhase）；地图（map）仅展示。
 * 出售权限：仅黄金台。
 * 同卦堆叠在同一格（显示 ×count），触发/出售消耗第一张（count-1，归零移出）。
 */
import Phaser from 'phaser';
import type { BuCiCard } from '../../models/RunState';
import { hexagramImageKey } from '../../models/RunState';
import * as RunManager from '../../models/RunManager';
import { sellBuci } from '../../models/Shop';
import { PLAYER_CHARACTERS, type PlayerCharacterId } from '../../models/Character';
import { useSimpleActive, resolveRemoveCharacter } from '../../engine/BuciEffects';
import { UIFactory } from '../../utils/UIFactory';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_UI, DEPTH_OVERLAY, AVATAR_SOURCE_SIZE } from '../../constants/Layout';

export type BuciBarContext = 'map' | 'shop' | 'battle';

export interface BuciBarOptions {
  x: number;
  y: number;
  context: BuciBarContext;
  /** 战斗中：当前是否处于主动技可发动阶段 */
  battleActivePhase?: boolean;
  /** 使用/出售后由场景刷新自身显示（天命/通宝等） */
  onStateChanged(): void;
}

const SLOT_W = 116;
const SLOT_H = 100;
const SLOT_GAP = 14;
const HEX_DISPLAY = 56;

export class BuciBarManager {
  private container: Phaser.GameObjects.Container | null = null;
  private openCardId: string | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly options: BuciBarOptions) {}

  /** 战斗主动技阶段状态变化时调用，重算「使用」可用性 */
  setBattleActivePhase(v: boolean): void {
    this.options.battleActivePhase = v;
    this.refresh();
  }

  refresh(): void {
    this.destroy();
    const run = RunManager.getRun();
    if (!run || run.buciCards.length === 0) return;

    const { x, y } = this.options;
    const container = this.scene.add.container(x, y).setDepth(DEPTH_UI);
    this.container = container;

    const totalW = run.buciCards.length * SLOT_W + (run.buciCards.length - 1) * SLOT_GAP;
    const startX = -totalW / 2;
    run.buciCards.forEach((card, i) => {
      const cx = startX + i * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
      this.renderSlot(container, card, cx);
    });
  }

  destroy(): void {
    this.container?.destroy();
    this.container = null;
    this.openCardId = null;
  }

  private renderSlot(container: Phaser.GameObjects.Container, card: BuCiCard, cx: number): void {
    const selected = this.openCardId === card.id;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a0a04, 0.78);
    bg.fillRoundedRect(cx - SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8);
    bg.lineStyle(selected ? 2 : 1.2, selected ? 0xe8d5a3 : 0x5a4030, selected ? 1 : 0.7);
    bg.strokeRoundedRect(cx - SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8);
    container.add(bg);

    const img = this.scene.add.image(cx, -16, hexagramImageKey(card.upper, card.lower));
    img.setScale(HEX_DISPLAY / img.width);
    container.add(img);

    container.add(this.scene.add.text(cx, 32, card.name, {
      fontSize: '18px', fontFamily: FONT_FAMILY, color: '#e8d5a3',
    }).setOrigin(0.5));

    if (card.count > 1) {
      container.add(this.scene.add.text(cx + SLOT_W / 2 - 12, -SLOT_H / 2 + 14, `×${card.count}`, {
        fontSize: '16px', fontFamily: FONT_FAMILY, color: '#d4a843',
      }).setOrigin(0.5));
    }

    const interactive = this.options.context !== 'map';
    if (interactive) {
      const zone = this.scene.add.zone(cx, 0, SLOT_W, SLOT_H).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.openCardId = this.openCardId === card.id ? null : card.id;
        this.refresh();
      });
      container.add(zone);
    }

    if (selected) {
      this.renderMenu(container, card, cx);
    }
  }

  private renderMenu(container: Phaser.GameObjects.Container, card: BuCiCard, cx: number): void {
    const canUse =
      card.type === 'active'
      && (this.options.context === 'shop'
        || (this.options.context === 'battle' && this.options.battleActivePhase));
    const canSell = this.options.context === 'shop';

    let menuY = SLOT_H / 2 + 22;
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '20px', fontFamily: FONT_FAMILY, color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2,
    };

    if (canUse) {
      const btn = UIFactory.button(this.scene, cx, menuY, '▶', '使 用', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.doUse(card);
      }, { w: 120, h: 44, textStyle: btnStyle });
      container.add(btn);
      menuY += 52;
    }
    if (canSell) {
      const sellLabel = `出售 ${Math.floor(card.price / 2)}`;
      const btn = UIFactory.button(this.scene, cx, menuY, '✕', sellLabel, () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.doSell(card);
      }, {
        w: 120, h: 44,
        textStyle: { fontSize: '20px', fontFamily: FONT_FAMILY, color: '#d4a843', stroke: '#2a1008', strokeThickness: 2 },
      });
      container.add(btn);
    }
  }

  private doUse(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run) return;
    const effect = card.effect;
    if (effect.kind === 'remove_character') {
      if (run.roster.length === 0) {
        this.showToast('无角色牌，无法使用');
        return;
      }
      this.openCardId = null;
      this.showCharacterPicker(card);
      return;
    }
    // 纯数值类主动（乾为天 / 天地否）
    const desc = useSimpleActive(run, card.id);
    if (desc === null) {
      this.showToast('当前无法使用');
      return;
    }
    this.openCardId = null;
    RunManager.save();
    this.refresh();
    this.options.onStateChanged();
    this.showToast(`【${card.name}】${desc}`);
  }

  private doSell(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run) return;
    const refund = sellBuci(run, card.id);
    if (refund <= 0) return;
    this.openCardId = null;
    RunManager.save();
    this.refresh();
    this.options.onStateChanged();
    this.showToast(`出售【${card.name}】 +${refund} 通宝`);
  }

  /** 天风姤：列出阵容角色供玩家选择移除 */
  private showCharacterPicker(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run) return;
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const n = run.roster.length;
    const panelW = 720;
    const panelH = 320;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    container.add(UIFactory.modalOverlay(this.scene, width, height, () => {
      container.destroy();
    }));
    container.add(UIFactory.modalPanel(this.scene, px, py, panelW, panelH, 10));
    container.add(this.scene.add.text(cx, py + 46, '选择要移除的角色（天风姤）', {
      fontSize: '30px', fontFamily: FONT_FAMILY, color: '#3a2010',
    }).setOrigin(0.5));

    const avatarSize = 84;
    const stride = 150;
    const gridX = cx - ((n - 1) / 2) * stride;
    run.roster.forEach((id, i) => {
      const ax = gridX + i * stride;
      const ay = py + 170;
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x2a1508, 1);
      bg.fillRoundedRect(ax - avatarSize / 2, ay - avatarSize / 2, avatarSize, avatarSize, 8);
      container.add(bg);
      const img = this.scene.add.image(ax, ay, `char_${id}`);
      img.setScale(avatarSize / AVATAR_SOURCE_SIZE);
      container.add(img);
      container.add(this.scene.add.text(ax, ay + avatarSize / 2 + 18, PLAYER_CHARACTERS[id].name, {
        fontSize: '20px', fontFamily: FONT_FAMILY, color: '#3a2010',
      }).setOrigin(0.5));

      const zone = this.scene.add.zone(ax, ay, avatarSize, avatarSize + 30).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        container.destroy();
        const desc = resolveRemoveCharacter(run, id as PlayerCharacterId);
        RunManager.save();
        this.refresh();
        this.options.onStateChanged();
        this.showToast(`【${card.name}】移除【${PLAYER_CHARACTERS[id].name}】，天命 +10`);
      });
      container.add(zone);
    });
  }

  /** 短暂浮动提示 */
  private showToast(message: string): void {
    const { width, height } = this.scene.scale;
    const txt = this.scene.add.text(width / 2, height * 0.30, message, {
      fontSize: '26px', fontFamily: FONT_FAMILY, color: '#ffd700',
      stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(DEPTH_OVERLAY);
    this.scene.tweens.add({
      targets: txt,
      alpha: { from: 0, to: 1 },
      duration: 160,
      yoyo: true,
      hold: 900,
      onComplete: () => txt.destroy(),
    });
  }
}
