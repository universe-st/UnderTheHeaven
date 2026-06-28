import Phaser from 'phaser';
import { FONT_FAMILY, DEPTH_BG, DEPTH_BG_BORDER, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT, DEPTH_UI } from '../constants/Layout';

const DARK_BG_COLOR = 0x1a0f05;
const BORDER_COLOR = 0x6a4a2a;
const ACCENT_COLOR = 0xb89040;
const ACCENT_BRIGHT_COLOR = 0xd4a843;
const PANEL_BG_COLOR = 0x1a0f05;

export interface ButtonConfig {
  w?: number;
  h?: number;
  radius?: number;
  textStyle?: Phaser.Types.GameObjects.Text.TextStyle;
  normalBg?: number;
  normalStroke?: number;
  hoverBg?: number;
  hoverStroke?: number;
  pressedBg?: number;
  pressedStroke?: number;
}

const DEFAULT_BUTTON: Required<ButtonConfig> = {
  w: 340, h: 72, radius: 6,
  textStyle: {
    fontSize: '28px', fontFamily: FONT_FAMILY,
    color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2,
  },
  normalBg: 0x5a3018, normalStroke: 0xc8a050,
  hoverBg: 0x6b3820, hoverStroke: 0xe8d5a3,
  pressedBg: 0x3a2010, pressedStroke: 0xa08040,
};

export class UIFactory {
  static darkBg(scene: Phaser.Scene, w: number, h: number): void {
    const bg = scene.add.graphics();
    bg.fillStyle(DARK_BG_COLOR, 1);
    bg.fillRect(0, 0, w, h);
    bg.setDepth(DEPTH_BG);
  }

  static darkBgWithBorder(scene: Phaser.Scene, w: number, h: number, borderPadding: number = 16): void {
    UIFactory.darkBg(scene, w, h);
    const border = scene.add.graphics();
    border.setDepth(DEPTH_BG_BORDER);
    border.lineStyle(1, BORDER_COLOR, 0.3);
    border.strokeRect(borderPadding, borderPadding, w - borderPadding * 2, h - borderPadding * 2);
  }

  static darkBgWithCenteredLines(scene: Phaser.Scene, w: number, h: number): void {
    UIFactory.darkBgWithBorder(scene, w, h, 20);
    const line = scene.add.graphics();
    line.setDepth(DEPTH_BG_BORDER);
    line.lineStyle(1, 0x3a2010, 0.3);
    line.lineBetween(0, h * 0.5, w, h * 0.5);
    line.lineBetween(w * 0.5, 0, w * 0.5, h);
  }

  static imageBg(scene: Phaser.Scene, w: number, h: number, textureKey: string): Phaser.GameObjects.Image {
    const img = scene.add.image(w / 2, h / 2, textureKey);
    img.setDepth(DEPTH_BG);
    const scaleX = w / img.width;
    const scaleY = h / img.height;
    img.setScale(Math.max(scaleX, scaleY));
    return img;
  }

  static divider(scene: Phaser.Scene, cx: number, cy: number, half: number = 140): void {
    const gfx = scene.add.graphics();
    gfx.lineStyle(1, ACCENT_COLOR, 0.5);
    gfx.lineBetween(cx - half, cy, cx - 16, cy);
    gfx.lineBetween(cx + 16, cy, cx + half, cy);
    gfx.fillStyle(ACCENT_BRIGHT_COLOR, 0.7);
    gfx.fillCircle(cx, cy, 3);
    gfx.lineStyle(1, ACCENT_COLOR, 0.3);
    gfx.lineBetween(cx - half - 16, cy, cx - half, cy);
    gfx.lineBetween(cx + half, cy, cx + half + 16, cy);
  }

  static panel(
    scene: Phaser.Scene,
    px: number, py: number, pw: number, ph: number,
    title?: string, options?: { radius?: number; bgAlpha?: number; titleFontSize?: string }
  ): void {
    const radius = options?.radius ?? 10;
    const bgAlpha = options?.bgAlpha ?? 0.8;
    const titleFontSize = options?.titleFontSize ?? '24px';

    const gfx = scene.add.graphics();
    gfx.fillStyle(PANEL_BG_COLOR, bgAlpha);
    gfx.fillRoundedRect(px, py, pw, ph, radius);
    gfx.lineStyle(1.5, ACCENT_COLOR, 0.55);
    gfx.strokeRoundedRect(px, py, pw, ph, radius);
    gfx.lineStyle(1, 0x5a4030, 0.2);
    gfx.strokeRoundedRect(px + 3, py + 3, pw - 6, ph - 6, radius - 2);

    if (title) {
      const labelX = px + 16;
      const labelY = py - 10;
      const titleW = title.length * 22 + 24;
      const labelBg = scene.add.graphics();
      labelBg.fillStyle(PANEL_BG_COLOR, 0.9);
      labelBg.fillRoundedRect(labelX - 6, labelY - 10, titleW, 28, 6);
      labelBg.lineStyle(1, ACCENT_COLOR, 0.4);
      labelBg.strokeRoundedRect(labelX - 6, labelY - 10, titleW, 28, 6);

      scene.add.text(labelX, labelY + 4, title, {
        fontSize: titleFontSize,
        fontFamily: FONT_FAMILY,
        color: '#c8a050',
      }).setOrigin(0, 0.5);
    }
  }

  static titleFrame(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number): void {
    const gfx = scene.add.graphics();
    const hw = w / 2;
    const hh = h / 2;
    const corner = 24;

    gfx.lineStyle(2, 0xb48c3c, 0.5);
    gfx.strokeRect(cx - hw, cy - hh, w, h);

    const inset = 5;
    gfx.lineStyle(1, 0xb48c3c, 0.2);
    gfx.strokeRect(cx - hw + inset, cy - hh + inset, w - inset * 2, h - inset * 2);

    gfx.lineStyle(2, ACCENT_BRIGHT_COLOR, 0.75);
    gfx.lineBetween(cx - hw, cy - hh + corner, cx - hw, cy - hh);
    gfx.lineBetween(cx - hw, cy - hh, cx - hw + corner, cy - hh);
    gfx.lineBetween(cx + hw - corner, cy - hh, cx + hw, cy - hh);
    gfx.lineBetween(cx + hw, cy - hh, cx + hw, cy - hh + corner);
    gfx.lineBetween(cx - hw, cy + hh - corner, cx - hw, cy + hh);
    gfx.lineBetween(cx - hw, cy + hh, cx - hw + corner, cy + hh);
    gfx.lineBetween(cx + hw - corner, cy + hh, cx + hw, cy + hh);
    gfx.lineBetween(cx + hw, cy + hh, cx + hw, cy + hh - corner);
  }

  static button(
    scene: Phaser.Scene,
    x: number, y: number, icon: string, label: string,
    callback: () => void,
    config?: ButtonConfig
  ): Phaser.GameObjects.Container {
    const cfg = { ...DEFAULT_BUTTON, ...config };
    const container = scene.add.container(0, 0).setDepth(DEPTH_UI);

    const gfx = scene.add.graphics();
    const drawNormal = () => {
      gfx.clear();
      gfx.fillStyle(cfg.normalBg, 1);
      gfx.fillRoundedRect(x - cfg.w / 2, y - cfg.h / 2, cfg.w, cfg.h, cfg.radius);
      gfx.fillStyle(cfg.normalBg + 0x201000, 0.35);
      gfx.fillRoundedRect(x - cfg.w / 2 + 2, y - cfg.h / 2 + 2, cfg.w - 4, cfg.h / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      gfx.lineStyle(1.5, cfg.normalStroke, 0.85);
      gfx.strokeRoundedRect(x - cfg.w / 2, y - cfg.h / 2, cfg.w, cfg.h, cfg.radius);
    };
    const drawHover = () => {
      gfx.clear();
      gfx.fillStyle(cfg.hoverBg, 1);
      gfx.fillRoundedRect(x - cfg.w / 2, y - cfg.h / 2, cfg.w, cfg.h, cfg.radius);
      gfx.fillStyle(cfg.hoverBg + 0x101000, 0.45);
      gfx.fillRoundedRect(x - cfg.w / 2 + 2, y - cfg.h / 2 + 2, cfg.w - 4, cfg.h / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      gfx.lineStyle(2, cfg.hoverStroke, 1);
      gfx.strokeRoundedRect(x - cfg.w / 2, y - cfg.h / 2, cfg.w, cfg.h, cfg.radius);
      gfx.lineStyle(4, cfg.hoverStroke - 0x203010, 0.12);
      gfx.strokeRoundedRect(x - cfg.w / 2 - 2, y - cfg.h / 2 - 2, cfg.w + 4, cfg.h + 4, cfg.radius + 2);
    };
    drawNormal();
    container.add(gfx);

    const text = scene.add.text(x, y, `${icon}  ${label}`, cfg.textStyle).setOrigin(0.5);
    container.add(text);

    const zone = scene.add.zone(x, y, cfg.w, cfg.h).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => drawHover());
    zone.on('pointerout', () => drawNormal());
    zone.on('pointerdown', () => {
      scene.tweens.add({
        targets: text,
        scaleX: 0.96, scaleY: 0.96, duration: 60, yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => { drawNormal(); callback(); },
      });
    });
    container.add(zone);

    return container;
  }

  static closeButton(
    scene: Phaser.Scene, x: number, y: number,
    onClose: () => void,
    sfxKey?: string
  ): void {
    const closeText = scene.add.text(x, y, '✕', {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = scene.add.zone(x, y, 52, 52)
      .setInteractive({ cursor: 'pointer' })
      .setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      if (sfxKey) scene.sound.play(sfxKey);
      onClose();
    });
  }

  static modalOverlay(
    scene: Phaser.Scene, w: number, h: number,
    onClickOutside: () => void
  ): Phaser.GameObjects.Graphics {
    const overlay = scene.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, w, h);
    overlay.setDepth(DEPTH_OVERLAY);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => onClickOutside());
    return overlay;
  }

  /**
   * 绘制蜘蛛网花纹，用于临时牌装饰。
   */
  static drawSpiderWeb(gfx: Phaser.GameObjects.Graphics, cardW: number, cardH: number): void {
    const hw = cardW / 2;
    const hh = cardH / 2;
    const cx = 0;
    const cy = 0;

    gfx.lineStyle(1, 0x88aacc, 0.6);

    gfx.lineBetween(cx, cy, -hw, -hh);
    gfx.lineBetween(cx, cy, hw, -hh * 0.7);
    gfx.lineBetween(cx, cy, -hw * 0.6, hh);
    gfx.lineBetween(cx, cy, hw * 0.8, hh * 0.3);

    gfx.lineBetween(cx, cy, cx, -hh);
    gfx.lineBetween(cx, cy, -hw * 0.3, hh * 0.5);
    gfx.lineBetween(cx, cy, hw * 0.4, -hh * 0.3);

    gfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.7, -hh * 0.1);
    gfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.15, -hh * 0.7);
    gfx.lineBetween(hw * 0.5, -hh * 0.2, hw * 0.3, -hh * 0.6);
    gfx.lineBetween(cx, -hh * 0.5, hw * 0.25, -hh * 0.8);

    gfx.lineStyle(0.8, 0x88aacc, 0.35);
    gfx.lineBetween(-hw * 0.15, -hh * 0.7, -hw * 0.45, -hh * 0.55);
    gfx.lineBetween(-hw * 0.7, -hh * 0.1, -hw * 0.5, hh * 0.2);
    gfx.lineBetween(hw * 0.3, -hh * 0.6, hw * 0.6, -hh * 0.4);
    gfx.lineBetween(cx, hh, -hw * 0.4, hh * 0.35);
    gfx.lineBetween(-hw * 0.3, hh * 0.5, -hw * 0.6, hh * 0.1);
  }

  static modalPanel(
    scene: Phaser.Scene,
    x: number, y: number, w: number, h: number,
    radius: number = 8
  ): Phaser.GameObjects.Graphics {
    const panel = scene.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(x, y, w, h, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(x, y, w, h, radius);
    panel.lineStyle(1, 0xa89878, 0.3);
    panel.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, radius - 1);
    panel.setDepth(DEPTH_OVERLAY);
    panel.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    return panel;
  }
}