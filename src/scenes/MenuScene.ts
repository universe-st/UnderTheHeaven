import Phaser from 'phaser';
import { loadAudioSettings, saveAudioSettings } from '../AudioSettings';
import { GameAudioManager } from '../utils/GameAudioManager';
import { VoiceManager } from '../utils/VoiceManager';
import { UIFactory } from '../utils/UIFactory';
import { FONT_FAMILY, DEPTH_OVERLAY } from '../constants/Layout';

const SHOW_TEST_BUTTON = true;

export class MenuScene extends Phaser.Scene {
  private particles: Phaser.GameObjects.Graphics[] = [];
  private bgImage!: Phaser.GameObjects.Image;
  private muteIndicator: Phaser.GameObjects.Text | null = null;

  private settingsOpen = false;
  private settingsContainer: Phaser.GameObjects.Container | null = null;
  private bgmVolume = 0.3;
  private sfxVolume = 0.5;
  private voiceVolume = 0.7;

  constructor() {
    super({ key: 'MenuScene' });
  }

  private resetSceneState(): void {
    this.particles = [];
    this.muteIndicator?.destroy();
    this.muteIndicator = null;
    this.settingsOpen = false;
    this.settingsContainer?.destroy();
    this.settingsContainer = null;
    const settings = loadAudioSettings();
    this.bgmVolume = settings.bgmVolume;
    this.sfxVolume = settings.sfxVolume;
    this.voiceVolume = settings.voiceVolume;
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    const { width, height } = this.scale;
    const cx = width / 2;

    this.bgImage = UIFactory.imageBg(this, width, height, 'game_background');

    const titleY = height * 0.26;

    UIFactory.divider(this, cx, titleY - 72);

    UIFactory.titleFrame(this, cx, titleY, 580, 140);

    this.add.text(cx, titleY - 12, '天 下 牌', {
      fontSize: '100px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, titleY + 40, '一 局 定 天 下', {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: '#b89050',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    UIFactory.divider(this, cx, titleY + 82);

    UIFactory.button(this, cx, height * 0.57, '▸', '开始游戏', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      GameAudioManager.stopBgm(this);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('GameScene');
      });
    }, { textStyle: { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2 } });

    // Disabled "继续游戏" button
    {
      const dw = 340; const dh = 72; const dy = height * 0.66;
      const disabledGfx = this.add.graphics();
      disabledGfx.fillStyle(0x2a1a0f, 0.5);
      disabledGfx.fillRoundedRect(cx - dw / 2, dy - dh / 2, dw, dh, 6);
      disabledGfx.lineStyle(1, 0x5a4030, 0.5);
      disabledGfx.strokeRoundedRect(cx - dw / 2, dy - dh / 2, dw, dh, 6);
      this.add.text(cx, dy, '✦  继续游戏', {
        fontSize: '30px',
        fontFamily: FONT_FAMILY,
        color: '#665544',
        stroke: '#1a0a00',
        strokeThickness: 2,
      }).setOrigin(0.5);
    }

    UIFactory.button(this, cx, height * 0.75, '⚙', '设  置', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.showSettings();
    }, { textStyle: { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2 } });

    if (SHOW_TEST_BUTTON) {
      UIFactory.button(this, cx, height * 0.84, '▶', '测试游戏', () => {
        GameAudioManager.playSfx(this, 'sfx_button');
        GameAudioManager.stopBgm(this);
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('TestSelectScene');
        });
      }, { textStyle: { fontSize: '30px', fontFamily: FONT_FAMILY, color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2 } });
    }

    this.add.text(cx, height - 22, 'v0.1.0  ·  天下牌 Under The Heaven', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#4a3020',
    }).setOrigin(0.5);

    this.createParticles(width, height);

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
    this.playMenuBgm();

    this.input.keyboard!.on('keydown-M', () => this.toggleMute());
  }

  private createParticles(w: number, h: number): void {
    const colors = [0xd4a843, 0xe8c870, 0xf0d878, 0xc8a040, 0xb89030];
    const count = 16;

    for (let i = 0; i < count; i++) {
      const dot = this.add.graphics();
      dot.setDepth(-1);

      const color = colors[Math.floor(Math.random() * colors.length)] ?? 0xd4a843;
      const size = 2 + Math.random() * 4;
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
    this.voiceVolume = settings.voiceVolume;
    GameAudioManager.playBgm(this, 'bgm_menu', { loop: true });
  }

  private toggleMute(): void {
    this.sound.mute = !this.sound.mute;
    this.showMuteIndicator();
  }

  private showMuteIndicator(): void {
    const { width } = this.scale;
    if (!this.muteIndicator) {
      this.muteIndicator = this.add.text(width - 16, 16, '', {
        fontSize: '36px',
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
    const panelW = 680;
    const panelH = 450;
    const px = (sw - panelW) / 2;
    const py = (sh - panelH) / 2;

    const container = this.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.settingsContainer = container;

    const overlay = UIFactory.modalOverlay(this, sw, sh, () => this.hideSettings());
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
      fontSize: '36px',
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
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#8a7040',
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerover', () => closeBtn.setColor('#e8d5a3'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#8a7040'));
    closeBtn.on('pointerdown', () => this.hideSettings());
    container.add(closeBtn);

    const trackW = panelW - 150;
    const sliderX = px + 75;
    this.createSlider(container, sliderX, py + 105, trackW, '背景音乐', this.bgmVolume, (v) => {
      this.bgmVolume = v;
      GameAudioManager.setBgmVolume(v);
    });

    this.createSlider(container, sliderX, py + 190, trackW, '游戏音效', this.sfxVolume, (v) => {
      this.sfxVolume = v;
      GameAudioManager.setSfxVolume(v);
    });

    const dividerB = this.add.graphics();
    dividerB.lineStyle(1, 0xb89040, 0.4);
    dividerB.lineBetween(px + panelW / 2 - 80, py + panelH - 55, px + panelW / 2 + 80, py + panelH - 55);
    container.add(dividerB);

    const hint = this.add.text(px + panelW / 2, py + panelH - 30, '设置自动保存', {
      fontSize: '18px',
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

    saveAudioSettings({ bgmVolume: this.bgmVolume, sfxVolume: this.sfxVolume, voiceVolume: this.voiceVolume });
    VoiceManager.reloadSettings();

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
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
    });
    container.add(labelText);

    const pct = Math.round(initialValue * 100);
    const valueText = this.add.text(lx + trackW, ty - 18, `${pct}`, {
      fontSize: '24px',
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