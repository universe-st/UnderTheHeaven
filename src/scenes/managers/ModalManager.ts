import Phaser from 'phaser';
import { FONT_FAMILY, DEPTH_UI, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT } from '../../constants/Layout';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { loadAudioSettings, saveAudioSettings } from '../../AudioSettings';

interface ModalHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly input: Phaser.Input.InputPlugin;
  readonly cameras: Phaser.Cameras.Scene2D.CameraManager;
  readonly time: Phaser.Time.Clock;
  readonly scene: Phaser.Scenes.ScenePlugin;
  settingsButton: Phaser.GameObjects.Container;
  handPatternButton: Phaser.GameObjects.Container;
  settingsPanel: Phaser.GameObjects.Container | null;
  volumeSettingsModal: Phaser.GameObjects.Container | null;
  returnConfirmModal: Phaser.GameObjects.Container | null;
  handPatternModal: Phaser.GameObjects.Container | null;
}

export class ModalManager {
  private host: ModalHost;
  private scene: Phaser.Scene;

  constructor(host: ModalHost & Phaser.Scene) {
    this.host = host;
    this.scene = host;
  }

  createHandPatternButton(w: number, _h: number): void {
    const btnX = w - 230;
    const btnY = 70;
    const btnW = 180;
    const btnH = 72;
    const radius = 16;

    const container = this.host.add.container(0, 0).setDepth(DEPTH_UI);

    const shadow = this.host.add.graphics();
    shadow.fillStyle(0x1a0a04, 0.15);
    shadow.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 3, btnW, btnH, radius);
    container.add(shadow);

    const bg = this.host.add.graphics();
    const drawNormal = () => {
      bg.clear();
      bg.fillStyle(0xf0e8d4, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2, 0x8a6030, 0.8);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(1, 0xb8963e, 0.35);
      bg.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radius - 2);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0xd4c4a8, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2.5, 0x6a4020, 1);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(1.2, 0xb8963e, 0.5);
      bg.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radius - 2);
    };
    const drawPressed = () => {
      bg.clear();
      bg.fillStyle(0x9a8a6a, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
      bg.lineStyle(2, 0x5a3018, 0.9);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radius);
    };
    drawNormal();
    container.add(bg);

    const text = this.host.add.text(btnX, btnY, '牌型', {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5);
    container.add(text);

    const zone = this.host.add.zone(btnX, btnY, btnW, btnH).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => {
      drawHover();
    });
    zone.on('pointerout', () => {
      drawNormal();
    });
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      drawPressed();
      this.host.time.delayedCall(80, () => {
        drawNormal();
        this.showHandPatternModal();
      });
    });
    container.add(zone);

    this.host.handPatternButton = container;
  }

  private createModalCloseButton(
    parent: Phaser.GameObjects.Container,
    x: number, y: number,
    onClick: () => void,
    zoneSize: number = 52,
  ): void {
    const text = this.host.add.text(x, y, '✕', {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const zone = this.host.add.zone(x, y, zoneSize, zoneSize)
      .setInteractive({ cursor: 'pointer' })
      .setDepth(DEPTH_OVERLAY_TEXT);
    zone.on('pointerover', () => text.setColor('#2a1008'));
    zone.on('pointerout', () => text.setColor('#7a5a3a'));
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      onClick();
    });
    parent.add([text, zone]);
  }

  showHandPatternModal(): void {
    if (this.host.handPatternModal) return;

    const { width: sw, height: sh } = this.host.scale;
    const modalW = 880;
    const modalH = 920;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const pad = 24;
    const radius = 8;

    const container = this.host.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.host.handPatternModal = container;

    const overlay = this.host.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeHandPatternModal());
    container.add(overlay);

    const panel = this.host.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(1, 0xa89878, 0.3);
    panel.strokeRoundedRect(modalX + 4, modalY + 4, modalW - 8, modalH - 8, radius - 1);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const titleY = modalY + 36;
    const title = this.host.add.text(modalX + modalW / 2, titleY, '牌型系数表', {
      fontSize: '42px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      stroke: '#e0d8c0',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    this.createModalCloseButton(container, modalX + modalW - 38, modalY + 22, () => this.closeHandPatternModal());

    const col1X = modalX + pad + 6;
    const col2X = col1X + 160;
    const col3X = col1X + 410;
    const headerY = titleY + 38;
    const headerStyle = { fontSize: '34px', fontFamily: FONT_FAMILY, color: '#4a2a10' } as const;

    const headerBg = this.host.add.graphics();
    headerBg.fillStyle(0xe0d8c8, 0.6);
    headerBg.fillRect(modalX + pad, headerY - 8, modalW - pad * 2, 36);
    container.add(headerBg);

    container.add(this.host.add.text(col1X, headerY, '牌型', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    container.add(this.host.add.text(col2X, headerY, '系数', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    container.add(this.host.add.text(col3X, headerY, '说明', headerStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));

    const divider = this.host.add.graphics();
    divider.lineStyle(1, 0xc8b898, 0.4);
    divider.lineBetween(modalX + pad, headerY + 14, modalX + modalW - pad, headerY + 14);
    container.add(divider);

    interface RowData {
      name: string;
      coeff: string;
      desc: string;
    }

    const rows: RowData[] = [
      { name: '单张', coeff: '×1', desc: '任意 1 张' },
      { name: '对子', coeff: '×1.2', desc: '同点 2 张' },
      { name: '三张', coeff: '×1.5', desc: '同点 3 张' },
      { name: '三带一', coeff: '×1.5', desc: '三张 + 1 单张' },
      { name: '三带二', coeff: '×2', desc: '三张 + 1 对子' },
      { name: '顺子', coeff: '2+(n-5)×0.5', desc: '不小于5张点数连续牌，n为牌数' },
      { name: '连对', coeff: '×2', desc: '连续对子，3 对起' },
      { name: '飞机', coeff: '×2.5', desc: '连续三张，2 组起' },
      { name: '飞机带单', coeff: '×2.5', desc: '飞机 + 等量单张' },
      { name: '飞机带对', coeff: '×2.5', desc: '飞机 + 等量对子' },
      { name: '炸弹', coeff: '×3', desc: '同点 4 张' },
      { name: '王炸', coeff: '×4', desc: '小王 + 大王' },
    ];

    const rowH = 46;
    const nameStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#2a1008' } as const;
    const coeffStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#4a2a10' } as const;
    const descStyle = { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#5a4a30' } as const;

    rows.forEach((row, i) => {
      const y = headerY + 34 + i * rowH;
      const isOdd = i % 2 === 1;
      if (isOdd) {
        const rowBg = this.host.add.graphics();
        rowBg.fillStyle(0xe8e0d0, 0.5);
        rowBg.fillRect(modalX + pad, y - rowH / 2 + 2, modalW - pad * 2, rowH - 3);
        container.add(rowBg);
      }
      if (i > 0) {
        const rowDivider = this.host.add.graphics();
        rowDivider.lineStyle(1, 0xd0c8b8, 0.25);
        rowDivider.lineBetween(modalX + pad, y - rowH / 2, modalX + modalW - pad, y - rowH / 2);
        container.add(rowDivider);
      }

      container.add(this.host.add.text(col1X, y, row.name, nameStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
      container.add(this.host.add.text(col2X, y, row.coeff, coeffStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
      container.add(this.host.add.text(col3X, y, row.desc, descStyle).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT));
    });

    const footerY = headerY + 24 + rows.length * rowH + 16;
    const footerDivider = this.host.add.graphics();
    footerDivider.lineStyle(1, 0xc8b898, 0.4);
    footerDivider.lineBetween(modalX + pad, footerY, modalX + modalW - pad, footerY);
    container.add(footerDivider);

    const noteStyle = { fontSize: '22px', fontFamily: FONT_FAMILY, color: '#5a4a30' } as const;
    const note2 = this.host.add.text(modalX + pad + 6, footerY + 24, '清空手牌时伤害×5', noteStyle)
      .setOrigin(0, 0).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(note2);

    container.setAlpha(0);
    this.host.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  closeHandPatternModal(): void {
    if (!this.host.handPatternModal) return;
    this.host.tweens.add({
      targets: this.host.handPatternModal,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.host.handPatternModal?.destroy();
        this.host.handPatternModal = null;
      },
    });
  }

  createSettingsButton(w: number, _h: number): void {
    const btnX = w - 72;
    const btnY = 72;
    const btnSize = 88;

    const container = this.host.add.container(0, 0).setDepth(DEPTH_UI);

    const bg = this.host.add.graphics();
    const drawNormal = () => {
      bg.clear();
      bg.fillStyle(0xf0e8d4, 0.9);
      bg.fillCircle(btnX, btnY, btnSize / 2);
      bg.lineStyle(1.5, 0x8a6030, 0.7);
      bg.strokeCircle(btnX, btnY, btnSize / 2);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0xe0d0b0, 1);
      bg.fillCircle(btnX, btnY, btnSize / 2);
      bg.lineStyle(2, 0x6a4020, 0.9);
      bg.strokeCircle(btnX, btnY, btnSize / 2);
    };
    drawNormal();
    container.add(bg);

    const gearGfx = this.host.add.graphics();
    gearGfx.setPosition(btnX, btnY);
    const drawGear = () => {
      gearGfx.clear();
      const innerR = 16;
      const outerR = 20;
      const teethCount = 8;
      const steps = teethCount * 2;
      gearGfx.fillStyle(0x2a1008, 1);
      gearGfx.beginPath();
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) gearGfx.moveTo(px, py);
        else gearGfx.lineTo(px, py);
      }
      gearGfx.closePath();
      gearGfx.fillPath();
      gearGfx.fillStyle(0xf0e8d4, 1);
      gearGfx.fillCircle(0, 0, 5);
    };
    drawGear();
    container.add(gearGfx);

    const zone = this.host.add.zone(btnX, btnY, btnSize + 12, btnSize + 12).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => {
      drawHover();
      this.host.tweens.add({
        targets: gearGfx,
        angle: 90,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    });
    zone.on('pointerout', () => {
      drawNormal();
      this.host.tweens.add({
        targets: gearGfx,
        angle: 0,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    });
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      if (this.host.settingsPanel) {
        this.closeSettingsPanel();
      } else {
        this.showSettingsPanel();
      }
    });
    container.add(zone);

    this.host.settingsButton = container;
  }

  showSettingsPanel(): void {
    if (this.host.settingsPanel) return;

    const { width: sw, height: sh } = this.host.scale;
    const panelW = 340;
    const panelH = 180;
    const panelX = sw - 48;
    const panelY = 72;
    const radius = 10;
    const itemH = 70;
    const pad = 8;

    const container = this.host.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.host.settingsPanel = container;

    const dismissOverlay = this.host.add.graphics();
    dismissOverlay.fillStyle(0x000000, 0.01);
    dismissOverlay.fillRect(0, 0, sw, sh);
    dismissOverlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    dismissOverlay.on('pointerdown', () => this.closeSettingsPanel());
    container.add(dismissOverlay);

    const panel = this.host.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.98);
    panel.fillRoundedRect(panelX - panelW, panelY, panelW, panelH, radius);
    panel.lineStyle(1.5, 0x8a6830, 0.8);
    panel.strokeRoundedRect(panelX - panelW, panelY, panelW, panelH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(panelX - panelW, panelY, panelW, panelH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const itemStyle = {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    } as const;

    const divider = this.host.add.graphics();
    divider.lineStyle(1, 0xc8b898, 0.4);
    divider.lineBetween(panelX - panelW + pad, panelY + itemH, panelX - pad, panelY + itemH);
    container.add(divider);

    const volumeItemY = panelY + itemH / 2;
    const volumeText = this.host.add.text(panelX - panelW / 2, volumeItemY, '音量设置', itemStyle)
      .setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(volumeText);

    const volZone = this.host.add.zone(panelX - panelW / 2, volumeItemY, panelW - pad * 2, itemH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    volZone.on('pointerover', () => volumeText.setColor('#6a4020'));
    volZone.on('pointerout', () => volumeText.setColor('#2a1008'));
    volZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.closeSettingsPanel();
      this.showVolumeSettings();
    });
    container.add(volZone);

    const menuItemY = panelY + itemH + itemH / 2;
    const menuText = this.host.add.text(panelX - panelW / 2, menuItemY, '返回主菜单', itemStyle)
      .setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(menuText);

    const menuZone = this.host.add.zone(panelX - panelW / 2, menuItemY, panelW - pad * 2, itemH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    menuZone.on('pointerover', () => menuText.setColor('#6a4020'));
    menuZone.on('pointerout', () => menuText.setColor('#2a1008'));
    menuZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.showReturnConfirmModal();
    });
    container.add(menuZone);

    container.setAlpha(0);
    this.host.tweens.add({
      targets: container,
      alpha: 1,
      duration: 120,
      ease: 'Sine.easeOut',
    });
  }

  closeSettingsPanel(): void {
    if (!this.host.settingsPanel) return;
    this.host.tweens.add({
      targets: this.host.settingsPanel,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.host.settingsPanel?.destroy();
        this.host.settingsPanel = null;
      },
    });
  }

  showVolumeSettings(): void {
    if (this.host.volumeSettingsModal) return;

    const { width: sw, height: sh } = this.host.scale;
    const modalW = 520;
    const modalH = 360;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const radius = 12;
    const pad = 28;

    const container = this.host.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.host.volumeSettingsModal = container;

    const overlay = this.host.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    const panel = this.host.add.graphics();
    panel.fillStyle(0xf2ead8, 0.95);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(1.5, 0x8a6830, 0.7);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const topGoldLine = this.host.add.graphics();
    topGoldLine.fillGradientStyle(0xc8a040, 0xc8a040, 0x8a6830, 0x8a6830, 0.8);
    topGoldLine.fillRoundedRect(modalX + 16, modalY, modalW - 32, 2, 1);
    container.add(topGoldLine);

    const titleY = modalY + 42;
    const title = this.host.add.text(modalX + modalW / 2, titleY, '音量设置', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
      stroke: '#e0d8c0',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const titleDivider = this.host.add.graphics();
    titleDivider.lineStyle(1, 0xd4c498, 0.5);
    titleDivider.lineBetween(modalX + pad, titleY + 18, modalX + modalW - pad, titleY + 18);
    container.add(titleDivider);

    const closeBtnW = 72;
    const closeBtnH = 36;
    const closeBtnX = modalX + modalW - closeBtnW / 2 - 14;
    const closeBtnY = modalY + 20;
    const closeBtnGfx = this.host.add.graphics();
    closeBtnGfx.fillStyle(0xf5f0e5, 0.9);
    closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
    closeBtnGfx.lineStyle(1.5, 0x8a6830, 0.8);
    closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
    container.add(closeBtnGfx);

    const closeText = this.host.add.text(closeBtnX, closeBtnY, '✕', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = this.host.add.zone(closeBtnX, closeBtnY, closeBtnW, closeBtnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => {
      closeBtnGfx.clear();
      closeBtnGfx.fillStyle(0xe8d8b8, 1);
      closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeBtnGfx.lineStyle(2, 0x6a4020, 0.9);
      closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeText.setColor('#2a1008');
    });
    closeZone.on('pointerout', () => {
      closeBtnGfx.clear();
      closeBtnGfx.fillStyle(0xf5f0e5, 0.9);
      closeBtnGfx.fillRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeBtnGfx.lineStyle(1.5, 0x8a6830, 0.8);
      closeBtnGfx.strokeRoundedRect(closeBtnX - closeBtnW / 2, closeBtnY - closeBtnH / 2, closeBtnW, closeBtnH, 8);
      closeText.setColor('#7a5a3a');
    });
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.closeVolumeSettings();
    });
    container.add([closeText, closeZone]);

    const settings = loadAudioSettings();

    const trackW = 360;
    const sliderX = modalX + (modalW - trackW) / 2;
    const labelX = sliderX;
    const bgmSliderY = titleY + 60;
    const sfxSliderY = bgmSliderY + 64;
    const voiceSliderY = sfxSliderY + 64;

    this.createVolumeSlider(
      container, labelX, bgmSliderY, sliderX, trackW,
      '音乐音量', settings.bgmVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.bgmVolume = value;
        saveAudioSettings(newSettings);
        GameAudioManager.setBgmVolume(value);
      }
    );

    this.createVolumeSlider(
      container, labelX, sfxSliderY, sliderX, trackW,
      '音效音量', settings.sfxVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.sfxVolume = value;
        saveAudioSettings(newSettings);
        GameAudioManager.setSfxVolume(value);
      }
    );

    this.createVolumeSlider(
      container, labelX, voiceSliderY, sliderX, trackW,
      '配音音量', settings.voiceVolume,
      (value) => {
        const newSettings = loadAudioSettings();
        newSettings.voiceVolume = value;
        saveAudioSettings(newSettings);
        GameAudioManager.setVoiceVolume(value);
      }
    );

    container.setAlpha(0);
    this.host.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private createVolumeSlider(
    parent: Phaser.GameObjects.Container,
    labelX: number, y: number,
    trackX: number, trackW: number,
    label: string,
    initialValue: number,
    onChange: (value: number) => void
  ): void {
    const trackH = 10;
    const handleR = 16;
    const trackColor = 0xd8d0c0;
    const fillColor1 = 0xc8a040;
    const fillColor2 = 0x8a6830;

    const labelText = this.host.add.text(labelX, y - 18, label, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(labelText);

    const trackY = y + 18;
    const trackRectX = trackX;

    const trackGfx = this.host.add.graphics();
    trackGfx.setDepth(DEPTH_OVERLAY_TEXT);
    trackGfx.fillStyle(trackColor, 0.5);
    trackGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    trackGfx.lineStyle(1, 0xb8a898, 0.4);
    trackGfx.strokeRoundedRect(trackRectX, trackY - trackH / 2, trackW, trackH, trackH / 2);
    parent.add(trackGfx);

    const fillGfx = this.host.add.graphics();
    fillGfx.setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(fillGfx);

    const valueText = this.host.add.text(trackX + trackW, y - 18, `${Math.round(initialValue * 100)}%`, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setOrigin(1, 0.5).setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(valueText);

    const handleGfx = this.host.add.graphics();
    handleGfx.setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(handleGfx);

    const handleZone = this.host.add.zone(trackRectX + trackW / 2, trackY, trackW + handleR * 4, handleR * 6)
      .setInteractive({ cursor: 'pointer' })
      .setDepth(DEPTH_OVERLAY_TEXT);
    parent.add(handleZone);

    let currentValue = initialValue;
    const updateUI = (value: number) => {
      currentValue = Phaser.Math.Clamp(value, 0, 1);
      const fillWidth = trackW * currentValue;
      const handleX = trackRectX + fillWidth;

      fillGfx.clear();
      if (fillWidth > 0) {
        fillGfx.fillStyle(fillColor1, 0.9);
        fillGfx.fillRoundedRect(trackRectX, trackY - trackH / 2, fillWidth, trackH, trackH / 2);
        if (fillWidth > trackH) {
          fillGfx.fillStyle(fillColor2, 0.6);
          fillGfx.fillRoundedRect(trackRectX + fillWidth / 2, trackY - trackH / 2, fillWidth / 2, trackH, trackH / 2);
        }
      }

      handleGfx.clear();
      handleGfx.fillStyle(0xf8f4ec, 0.4);
      handleGfx.fillCircle(handleX, trackY, handleR + 3);
      handleGfx.fillStyle(0xf5f0e5, 1);
      handleGfx.fillCircle(handleX, trackY, handleR);
      handleGfx.lineStyle(2, fillColor2, 0.9);
      handleGfx.strokeCircle(handleX, trackY, handleR);

      valueText.setText(`${Math.round(currentValue * 100)}%`);

      onChange(currentValue);
    };

    updateUI(initialValue);

    let dragging = false;

    handleZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      const ratio = (pointer.x - trackRectX) / trackW;
      updateUI(ratio);
    });

    handleZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const ratio = (pointer.x - trackRectX) / trackW;
      updateUI(ratio);
    });

    handleZone.on('pointerup', () => {
      dragging = false;
    });

    this.host.input.on('pointerup', () => {
      dragging = false;
    });
  }

  closeVolumeSettings(): void {
    if (!this.host.volumeSettingsModal) return;
    this.host.tweens.add({
      targets: this.host.volumeSettingsModal,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.host.volumeSettingsModal?.destroy();
        this.host.volumeSettingsModal = null;
      },
    });
  }

  showReturnConfirmModal(): void {
    if (this.host.returnConfirmModal) return;

    const { width: sw, height: sh } = this.host.scale;
    const modalW = 400;
    const modalH = 200;
    const modalX = (sw - modalW) / 2;
    const modalY = (sh - modalH) / 2;
    const radius = 12;

    const container = this.host.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.host.returnConfirmModal = container;

    const overlay = this.host.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    container.add(overlay);

    const panel = this.host.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(modalX, modalY, modalW, modalH, radius);
    panel.setInteractive(new Phaser.Geom.Rectangle(modalX, modalY, modalW, modalH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const title = this.host.add.text(modalX + modalW / 2, modalY + 48, '确认返回主菜单？', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(title);

    const subtitle = this.host.add.text(modalX + modalW / 2, modalY + 82, '当前对局进度将丢失', {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(subtitle);

    const btnW = 120;
    const btnH = 44;
    const btnY = modalY + 136;

    const cancelBtnX = modalX + modalW / 2 - 80;
    const cancelBg = this.host.add.graphics();
    cancelBg.fillStyle(0xe8dcc8, 1);
    cancelBg.fillRoundedRect(cancelBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    cancelBg.lineStyle(1.5, 0x8a6830, 0.6);
    cancelBg.strokeRoundedRect(cancelBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    container.add(cancelBg);

    const cancelText = this.host.add.text(cancelBtnX, btnY, '取消', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#5a4a30',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(cancelText);

    const cancelZone = this.host.add.zone(cancelBtnX, btnY, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    cancelZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.closeReturnConfirmModal();
    });
    container.add(cancelZone);

    const confirmBtnX = modalX + modalW / 2 + 80;
    const confirmBg = this.host.add.graphics();
    confirmBg.fillStyle(0xc8a878, 1);
    confirmBg.fillRoundedRect(confirmBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    confirmBg.lineStyle(1.5, 0x8a6030, 0.8);
    confirmBg.strokeRoundedRect(confirmBtnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    container.add(confirmBg);

    const confirmText = this.host.add.text(confirmBtnX, btnY, '确认', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#1a0a04',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(confirmText);

    const confirmZone = this.host.add.zone(confirmBtnX, btnY, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    confirmZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.closeReturnConfirmModal();
      this.closeSettingsPanel();
      this.host.cameras.main.fadeOut(400, 0, 0, 0);
      this.host.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.host.scene.start('MenuScene');
      });
    });
    container.add(confirmZone);

    container.setAlpha(0);
    this.host.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  closeReturnConfirmModal(): void {
    if (!this.host.returnConfirmModal) return;
    this.host.tweens.add({
      targets: this.host.returnConfirmModal,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.host.returnConfirmModal?.destroy();
        this.host.returnConfirmModal = null;
      },
    });
  }
}
