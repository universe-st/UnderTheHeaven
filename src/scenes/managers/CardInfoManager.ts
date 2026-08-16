import Phaser from 'phaser';
import type { Card } from '../../models/Card';
import { SEAL_LABELS, SEAL_DESCRIPTIONS, SEAL_IMAGE_KEYS, SEAL_SOURCE_SIZE } from '../../models/FourSeal';
import { FONT_FAMILY, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT, CARD_H } from '../../constants/Layout';

/**
 * 手牌长按信息小窗。
 *
 * 玩家长按手牌（约 500ms）时在牌附近弹出信息面板，展示：
 * 花色 / 点数 / 牌面分数（score），以及四象印（印图 + 印名 + 效果描述）
 * 与临时牌提示。窗口层级不低于 DEPTH_OVERLAY；
 * 点击窗口之外的任意位置（全屏 zone 范式）关闭。
 *
 * 长按计时由 DragInputManager 负责（拖拽移动 / 松开即取消），
 * 本类只负责窗口的创建与销毁。
 */
export interface CardInfoHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly tweens: Phaser.Tweens.TweenManager;
}

const SUIT_LABELS: Record<string, string> = {
  spade: '黑桃',
  club: '梅花',
  heart: '红桃',
  diamond: '方片',
};

const PANEL_W = 330;
const PANEL_RADIUS = 8;

export class CardInfoManager {
  private host: CardInfoHost & Phaser.Scene;
  private window: Phaser.GameObjects.Container | null = null;

  constructor(host: CardInfoHost & Phaser.Scene) {
    this.host = host;
  }

  isOpen(): boolean {
    return this.window !== null;
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
  }

  close(): void {
    if (!this.window) return;
    const win = this.window;
    this.host.tweens.add({
      targets: win,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.window === win) {
          win.destroy();
          this.window = null;
        }
      },
    });
  }

  /**
   * 在牌的屏幕坐标 (cardX, cardY) 附近弹出信息窗。
   * 窗口默认显示在牌上方；若放不下则移到牌下方，并始终保持在画布范围内。
   */
  show(card: Card, cardX: number, cardY: number): void {
    // 立即销毁旧窗口（不走 close() 的淡出动画，避免连续长按被旧窗口阻塞）
    this.window?.destroy();
    this.window = null;

    const h = this.host;
    const { width: sw, height: sh } = h.scale;

    // ── 先测量内容高度 ──
    const measure = h.add.text(0, 0, '', { fontSize: '20px', fontFamily: FONT_FAMILY });
    const wrap = (text: string, maxW: number): string[] => {
      const lines: string[] = [];
      let cur = '';
      for (const ch of text) {
        const test = cur + ch;
        measure.setText(test);
        if (measure.width > maxW && cur.length > 0) {
          lines.push(cur);
          cur = ch;
        } else {
          cur = test;
        }
      }
      measure.destroy();
      if (cur.length > 0) lines.push(cur);
      return lines;
    };

    const innerW = PANEL_W - 40;
    let panelH = 56; // 标题区（含底部留白）
    let sealLines: string[] = [];
    if (card.seal) {
      panelH += 30; // 印名行
      sealLines = wrap(SEAL_DESCRIPTIONS[card.seal], innerW - 34);
      panelH += sealLines.length * 24 + 8;
    }
    if (card.isTemp) {
      panelH += 30;
    }
    panelH += 12;

    // ── 定位：优先牌上方，越界则翻到下方并夹紧在屏幕内 ──
    let px = cardX;
    let py = cardY - CARD_H / 2 - panelH - 14;
    if (py < 16) {
      py = cardY + CARD_H / 2 + 14;
    }
    px = Phaser.Math.Clamp(px, PANEL_W / 2 + 12, sw - PANEL_W / 2 - 12);
    py = Phaser.Math.Clamp(py, 16, sh - panelH - 16);

    const container = h.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.window = container;

    // 全屏透明 zone：点击窗口外任意位置关闭
    const overlay = h.add.graphics();
    overlay.fillStyle(0x000000, 0.35);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.close());
    container.add(overlay);

    // 面板（拦截自身区域的点击，避免误关）
    const panel = h.add.graphics();
    const left = px - PANEL_W / 2;
    const top = py;
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(left, top, PANEL_W, panelH, PANEL_RADIUS);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(left, top, PANEL_W, panelH, PANEL_RADIUS);
    panel.setInteractive(new Phaser.Geom.Rectangle(left, top, PANEL_W, panelH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    // ── 标题行：花色 + 点数；王牌显示「龍 大王」/「虎 小王」 ──
    // 王牌的 rankLabel 为「虎」（rank 25，小王）/「龍」（rank 30，大王），
    // 旧实现直接用 rankLabel 拼标题会产生「虎 虎」「龍 龍」。
    let titleText: string;
    if (card.suit !== null) {
      titleText = `${SUIT_LABELS[card.suit]} ${card.rankLabel}`;
    } else {
      const jokerName = card.rank === 30 ? '大王' : '小王';
      titleText = `${card.rankLabel} ${jokerName}`;
    }
    const title = h.add.text(px, top + 28, titleText, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const divider = h.add.graphics();
    divider.lineStyle(1, 0xd0c4a8, 0.5);
    divider.lineBetween(left + 18, top + 52, left + PANEL_W - 18, top + 52);
    container.add(divider);

    // ── 分数行（牌面分数 score，与点数独立，可能被技能修改） ──
    let lineY = top + 78;
    const score = h.add.text(left + 24, lineY, `分数：${card.score}`, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#5a4a30',
    }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(score);
    lineY += 28;

    // ── 四象印：印图 + 印名 + 效果描述 ──
    if (card.seal) {
      const sealKey = SEAL_IMAGE_KEYS[card.seal];
      const sealImg = h.add.image(left + 26, lineY + 8, sealKey);
      sealImg.setScale(44 / SEAL_SOURCE_SIZE);
      sealImg.setDepth(DEPTH_OVERLAY_TEXT);
      container.add(sealImg);

      const sealName = h.add.text(left + 52, lineY, `【${SEAL_LABELS[card.seal]}】`, {
        fontSize: '20px',
        fontFamily: FONT_FAMILY,
        color: '#8a6030',
      }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
      container.add(sealName);

      lineY += 26;
      for (const line of sealLines) {
        const desc = h.add.text(left + 52, lineY, line, {
          fontSize: '17px',
          fontFamily: FONT_FAMILY,
          color: '#6a5a40',
        }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
        container.add(desc);
        lineY += 24;
      }
      lineY += 6;
    }

    // ── 临时牌提示 ──
    if (card.isTemp) {
      const tempHint = h.add.text(px, lineY + 6, '临时牌：打出后不进入牌库', {
        fontSize: '17px',
        fontFamily: FONT_FAMILY,
        color: '#3a6a8a',
      }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
      container.add(tempHint);
    }

    container.setAlpha(0);
    h.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }
}
