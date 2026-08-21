import type Phaser from 'phaser';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_UI } from '../../constants/Layout';

export interface ButtonHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  btnPlay: Phaser.GameObjects.Container;
  btnPass: Phaser.GameObjects.Container;
  btnPlayText: Phaser.GameObjects.Text;
  btnPassText: Phaser.GameObjects.Text;
  btnHint: Phaser.GameObjects.Container;
  btnHintText: Phaser.GameObjects.Text;
}

export class ButtonManager {
  private host: ButtonHost;
  private scene: Phaser.Scene;
  private onPlayClick: () => Promise<void>;
  private onPassClick: () => Promise<void>;
  private onHintClick: () => void;

  constructor(
    host: ButtonHost & Phaser.Scene,
    onPlayClick: () => Promise<void>,
    onPassClick: () => Promise<void>,
    onHintClick: () => void,
  ) {
    this.host = host;
    this.scene = host;
    this.onPlayClick = onPlayClick;
    this.onPassClick = onPassClick;
    this.onHintClick = onHintClick;
  }

  createButtons(w: number, h: number): void {
    const btnY = h - 320;
    const btnW = 250;
    const btnH = 80;

    this.host.btnHint = this.host.add.container(w / 2 - 480, btnY).setDepth(DEPTH_UI);
    const hintBg = this.host.add.graphics();
    hintBg.fillStyle(0xd8c8a0, 1);
    hintBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    hintBg.lineStyle(1.5, 0x8a6030, 0.85);
    hintBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.host.btnHint.add(hintBg);

    this.host.btnHintText = this.host.add.text(0, 0, '提  示', {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#1a0a04',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.host.btnHint.add(this.host.btnHintText);

    const hintZone = this.host.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    hintZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.onHintClick();
    });
    this.host.btnHint.add(hintZone);

    this.host.btnPlay = this.host.add.container(w / 2 - 160, btnY).setDepth(DEPTH_UI);
    const playBg = this.host.add.graphics();
    playBg.fillStyle(0xc8a878, 1);
    playBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    playBg.lineStyle(1.5, 0x8a6030, 0.85);
    playBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.host.btnPlay.add(playBg);

    this.host.btnPlayText = this.host.add.text(0, 0, '出  牌', {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#1a0a04',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.host.btnPlay.add(this.host.btnPlayText);

    const playZone = this.host.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    playZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      void this.onPlayClick();
    });
    this.host.btnPlay.add(playZone);

    this.host.btnPass = this.host.add.container(w / 2 + 160, btnY).setDepth(DEPTH_UI);
    const passBg = this.host.add.graphics();
    passBg.fillStyle(0xe8dcc8, 1);
    passBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    passBg.lineStyle(1, 0xb8a888, 0.6);
    passBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.host.btnPass.add(passBg);

    this.host.btnPassText = this.host.add.text(0, 0, '不  出', {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#6a5a40',
      stroke: '#e8dcc8',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.host.btnPass.add(this.host.btnPassText);

    const passZone = this.host.add.zone(0, 0, btnW, btnH).setInteractive({ cursor: 'pointer' });
    passZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      void this.onPassClick();
    });
    this.host.btnPass.add(passZone);
  }
}
