import Phaser from 'phaser';
import { loadAudioSettings, saveAudioSettings } from '../AudioSettings';
import { AudioManager } from '../utils/AudioManager';

const FONT_FAMILY = '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif';

export class MenuScene extends Phaser.Scene {
  private particles: Phaser.GameObjects.Graphics[] = [];
  private bgImage!: Phaser.GameObjects.Image;
  private muteIndicator: Phaser.GameObjects.Text | null = null;

  private settingsOpen = false;
  private settingsContainer: Phaser.GameObjects.Container | null = null;
  private bgmVolume = 0.3;
  private sfxVolume = 0.5;

  constructor() {
    super({ key: 'MenuScene' });
  }

  preload(): void {
    this.load.image('game_background', 'background_under_the_heaven.jpg');
    this.load.audio('bgm_menu', 'bgm_menu_44100.mp3');
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;

    this.drawBackground(width, height);

    const titleY = height * 0.26;

    this.drawDivider(cx, titleY - 72);

    this.drawTitleFrame(cx, titleY, 460, 116);

    this.add.text(cx, titleY - 12, '天 下 牌', {
      fontSize: '80px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, titleY + 40, '一 局 定 天 下', {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: '#b89050',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.drawDivider(cx, titleY + 82);

    this.createButton(cx, height * 0.62, false, () => {
      AudioManager.stopBgm(this);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('GameScene');
      });
    }, '▸', '开始游戏');
    this.createButton(cx, height * 0.71, true, () => console.log('continue'), '✦', '继续游戏');
    this.createButton(cx, height * 0.80, false, () => this.showSettings(), '⚙', '设  置');

    this.add.text(cx, height - 22, 'v0.1.0  ·  天下牌 Under The Heaven', {
      fontSize: '12px',
      fontFamily: FONT_FAMILY,
      color: '#4a3020',
    }).setOrigin(0.5);

    this.createParticles(width, height);

    AudioManager.init(this);
    AudioManager.unlock(this);
    this.playMenuBgm();

    this.input.keyboard!.on('keydown-M', () => this.toggleMute());
  }

  private drawBackground(w: number, h: number): void {
    this.bgImage = this.add.image(w / 2, h / 2, 'game_background');
    this.bgImage.setDepth(-10);
    // Scale to fill the screen while maintaining aspect ratio
    const scaleX = w / this.bgImage.width;
    const scaleY = h / this.bgImage.height;
    this.bgImage.setScale(Math.max(scaleX, scaleY));
  }

  private drawDivider(cx: number, cy: number): void {
    const gfx = this.add.graphics();
    const half = 110;

    gfx.lineStyle(1, 0xb89040, 0.5);
    gfx.lineBetween(cx - half, cy, cx - 16, cy);
    gfx.lineBetween(cx + 16, cy, cx + half, cy);

    gfx.fillStyle(0xd4a843, 0.7);
    gfx.fillCircle(cx, cy, 3);

    gfx.lineStyle(1, 0xb89040, 0.3);
    gfx.lineBetween(cx - half - 16, cy, cx - half, cy);
    gfx.lineBetween(cx + half, cy, cx + half + 16, cy);
  }

  private drawTitleFrame(cx: number, cy: number, w: number, h: number): void {
    const gfx = this.add.graphics();
    const hw = w / 2;
    const hh = h / 2;
    const corner = 20;

    gfx.lineStyle(2, 0xb48c3c, 0.5);
    gfx.strokeRect(cx - hw, cy - hh, w, h);

    const inset = 5;
    gfx.lineStyle(1, 0xb48c3c, 0.2);
    gfx.strokeRect(cx - hw + inset, cy - hh + inset, w - inset * 2, h - inset * 2);

    gfx.lineStyle(2, 0xd4a843, 0.75);
    gfx.lineBetween(cx - hw, cy - hh + corner, cx - hw, cy - hh);
    gfx.lineBetween(cx - hw, cy - hh, cx - hw + corner, cy - hh);

    gfx.lineBetween(cx + hw - corner, cy - hh, cx + hw, cy - hh);
    gfx.lineBetween(cx + hw, cy - hh, cx + hw, cy - hh + corner);

    gfx.lineBetween(cx - hw, cy + hh - corner, cx - hw, cy + hh);
    gfx.lineBetween(cx - hw, cy + hh, cx - hw + corner, cy + hh);

    gfx.lineBetween(cx + hw - corner, cy + hh, cx + hw, cy + hh);
    gfx.lineBetween(cx + hw, cy + hh, cx + hw, cy + hh - corner);
  }

  private createButton(
    x: number, y: number, disabled: boolean,
    callback: () => void, icon: string, label: string
  ): void {
    const w = 250;
    const h = 52;

    const gfx = this.add.graphics();

    const drawNormal = () => {
      gfx.clear();
      if (disabled) {
        gfx.fillStyle(0x2a1a0f, 0.5);
        gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
        gfx.lineStyle(1, 0x5a4030, 0.5);
        gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      } else {
        gfx.fillStyle(0x5a3018, 1);
        gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
        gfx.fillStyle(0x7a4a28, 0.35);
        gfx.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 });
        gfx.lineStyle(1.5, 0xc8a050, 0.85);
        gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      }
    };

    const drawHover = () => {
      if (disabled) return;
      gfx.clear();
      gfx.fillStyle(0x6b3820, 1);
      gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      gfx.fillStyle(0x8a4a28, 0.45);
      gfx.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      gfx.lineStyle(2, 0xe8d5a3, 1);
      gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      gfx.lineStyle(4, 0xd4a843, 0.12);
      gfx.strokeRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 8);
    };

    drawNormal();

    const hitArea = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    const btn = this.add.zone(x, y, w, h).setInteractive({ hitArea, cursor: 'pointer' });

    const iconStr = icon === '⚙' ? '⚙' : icon;
    const text = this.add.text(x, y, `${iconStr}  ${label}`, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: disabled ? '#665544' : '#e8d5a3',
      stroke: disabled ? '#1a0a00' : '#2a1008',
      strokeThickness: 2,
    }).setOrigin(0.5);

    if (!disabled) {
      btn.on('pointerover', () => drawHover());
      btn.on('pointerout', () => drawNormal());
      btn.on('pointerdown', () => {
        gfx.clear();
        gfx.fillStyle(0x3a2010, 1);
        gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
        gfx.lineStyle(1.5, 0xa08040, 0.7);
        gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);

        this.tweens.add({
          targets: text,
          scaleX: 0.96,
          scaleY: 0.96,
          duration: 60,
          yoyo: true,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            drawNormal();
            callback();
          },
        });
      });
    }
  }

  private createParticles(w: number, h: number): void {
    const colors = [0xd4a843, 0xe8c870, 0xf0d878, 0xc8a040, 0xb89030];
    const count = 16;

    for (let i = 0; i < count; i++) {
      const dot = this.add.graphics();
      dot.setDepth(-1);

      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 1.5 + Math.random() * 3;
      dot.fillStyle(color, 0.5 + Math.random() * 0.5);
      dot.fillCircle(0, 0, size);

      dot.x = Math.random() * w;
      dot.y = 40 + Math.random() * (h - 80);
      dot.setAlpha(0);

      this.particles.push(dot);

      this.time.delayedCall(i * 400, () => {
        this.floatParticle(dot, w, h);
      });
    }
  }

  private floatParticle(dot: Phaser.GameObjects.Graphics, w: number, h: number): void {
    const riseDuration = 4000 + Math.random() * 6000;
    const driftX = dot.x + (Math.random() - 0.5) * 120;
    const driftY = dot.y - 80 - Math.random() * 200;

    this.tweens.add({
      targets: dot,
      x: driftX,
      y: driftY,
      alpha: { from: 0, to: 0.6 },
      duration: riseDuration * 0.35,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: dot,
          alpha: { from: 0.6, to: 0 },
          duration: riseDuration * 0.65,
          ease: 'Sine.easeIn',
          onComplete: () => {
            dot.x = Math.random() * w;
            dot.y = Math.random() * h;
            dot.setAlpha(0);
            this.floatParticle(dot, w, h);
          },
        });
      },
    });
  }

  private playMenuBgm(): void {
    const settings = loadAudioSettings();
    this.bgmVolume = settings.bgmVolume;
    this.sfxVolume = settings.sfxVolume;
    AudioManager.playBgm(this, 'bgm_menu', { loop: true });
  }

  private toggleMute(): void {
    this.sound.mute = !this.sound.mute;
    this.showMuteIndicator();
  }

  private showMuteIndicator(): void {
    const { width } = this.scale;
    if (!this.muteIndicator) {
      this.muteIndicator = this.add.text(width - 16, 16, '', {
        fontSize: '28px',
      }).setOrigin(1, 0).setAlpha(0).setDepth(100);
    }
    this.muteIndicator.setText(this.sound.mute ? '🔇' : '🔊');
    this.tweens.killTweensOf(this.muteIndicator);
    this.muteIndicator.setAlpha(0);
    this.tweens.add({
      targets: this.muteIndicator,
      alpha: 1,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.tweens.add({
          targets: this.muteIndicator,
          alpha: 0,
          delay: 2000,
          duration: 500,
          ease: 'Sine.easeOut',
        });
      },
    });
  }

  private showSettings(): void {
    if (this.settingsOpen) return;
    this.settingsOpen = true;

    const { width: sw, height: sh } = this.scale;
    const panelW = 500;
    const panelH = 340;
    const px = (sw - panelW) / 2;
    const py = (sh - panelH) / 2;

    const container = this.add.container(0, 0).setDepth(200);
    this.settingsContainer = container;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.hideSettings());
    container.add(overlay);

    const panel = this.add.graphics();
    panel.fillStyle(0x1a0f05, 0.96);
    panel.fillRoundedRect(px, py, panelW, panelH, 10);
    panel.lineStyle(2, 0xb89040, 0.8);
    panel.strokeRoundedRect(px, py, panelW, panelH, 10);
    panel.lineStyle(1, 0x5a4030, 0.3);
    panel.strokeRoundedRect(px + 5, py + 5, panelW - 10, panelH - 10, 8);
    panel.setInteractive(new Phaser.Geom.Rectangle(px, py, panelW, panelH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const title = this.add.text(px + panelW / 2, py + 40, '设  置', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 2,
    }).setOrigin(0.5);
    container.add(title);

    const dividerT = this.add.graphics();
    dividerT.lineStyle(1, 0xb89040, 0.5);
    dividerT.lineBetween(px + panelW / 2 - 100, py + 58, px + panelW / 2 + 100, py + 58);
    container.add(dividerT);

    const closeBtn = this.add.text(px + panelW - 36, py + 14, '✕', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerover', () => closeBtn.setColor('#e8d5a3'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#8a7040'));
    closeBtn.on('pointerdown', () => this.hideSettings());
    container.add(closeBtn);

    const trackW = panelW - 110;
    const sliderX = px + 55;
    this.createSlider(container, sliderX, py + 105, trackW, '背景音乐', this.bgmVolume, (v) => {
      this.bgmVolume = v;
      AudioManager.setBgmVolume(v);
    });

    this.createSlider(container, sliderX, py + 190, trackW, '游戏音效', this.sfxVolume, (v) => {
      this.sfxVolume = v;
    });

    const dividerB = this.add.graphics();
    dividerB.lineStyle(1, 0xb89040, 0.4);
    dividerB.lineBetween(px + panelW / 2 - 80, py + panelH - 55, px + panelW / 2 + 80, py + panelH - 55);
    container.add(dividerB);

    const hint = this.add.text(px + panelW / 2, py + panelH - 30, '设置自动保存', {
      fontSize: '14px',
      fontFamily: FONT_FAMILY,
      color: '#5a4030',
    }).setOrigin(0.5);
    container.add(hint);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private hideSettings(): void {
    if (!this.settingsOpen || !this.settingsContainer) return;

    saveAudioSettings({ bgmVolume: this.bgmVolume, sfxVolume: this.sfxVolume });

    const container = this.settingsContainer;
    this.tweens.add({
      targets: container,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        container.destroy();
        this.settingsContainer = null;
        this.settingsOpen = false;
      },
    });
  }

  private createSlider(
    container: Phaser.GameObjects.Container,
    lx: number, ty: number, trackW: number,
    label: string, initialValue: number,
    onChange: (value: number) => void,
  ): void {
    const labelText = this.add.text(lx, ty - 18, label, {
      fontSize: '20px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
    });
    container.add(labelText);

    const pct = Math.round(initialValue * 100);
    const valueText = this.add.text(lx + trackW, ty - 18, `${pct}`, {
      fontSize: '18px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
    }).setOrigin(1, 0);
    container.add(valueText);

    const track = this.add.graphics();
    track.fillStyle(0x1a0a00, 0.7);
    track.fillRoundedRect(lx, ty + 6, trackW, 10, 5);
    track.lineStyle(1, 0x5a4030, 0.5);
    track.strokeRoundedRect(lx, ty + 6, trackW, 10, 5);
    container.add(track);

    const fill = this.add.graphics();
    container.add(fill);

    const handleR = 10;
    const handle = this.add.graphics();
    container.add(handle);

    const handleZone = this.add.zone(lx + trackW / 2, ty + 6 + 5, trackW + handleR * 4, 40)
      .setInteractive({ cursor: 'pointer' });
    container.add(handleZone);

    const updateSlider = (v: number) => {
      const clamped = Phaser.Math.Clamp(v, 0, 1);
      const hx = lx + trackW * clamped;

      fill.clear();
      const fw = trackW * clamped;
      if (fw > 2) {
        fill.fillStyle(0xc8a050, 0.6);
        fill.fillRoundedRect(lx + 1, ty + 7, fw - 2, 8, 3);
      }

      handle.clear();
      handle.fillStyle(0xe8d5a3, 1);
      handle.fillCircle(hx, ty + 6 + 5, handleR);
      handle.lineStyle(2, 0x3a2010, 0.5);
      handle.strokeCircle(hx, ty + 6 + 5, handleR);

      valueText.setText(`${Math.round(clamped * 100)}`);
      onChange(clamped);
    };

    updateSlider(initialValue);

    let dragging = false;

    handleZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      const v = (pointer.x - lx) / trackW;
      updateSlider(v);
    });

    handleZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const v = (pointer.x - lx) / trackW;
      updateSlider(v);
    });

    handleZone.on('pointerup', () => {
      dragging = false;
    });

    this.input.on('pointerup', () => {
      dragging = false;
    });
  }
}
