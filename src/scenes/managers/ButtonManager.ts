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
}

export class ButtonManager {
  private host: ButtonHost;
  private scene: Phaser.Scene;
  private onPlayClick: () => Promise<void>;
  private onPassClick: () => Promise<void>;

  constructor(
    host: ButtonHost & Phaser.Scene,
    onPlayClick: () => Promise<void>,
    onPassClick: () => Promise<void>,
  ) {
    this.host = host;
    this.scene = host;
    this.onPlayClick = onPlayClick;
    this.onPassClick = onPassClick;
  }

  createButtons(w: number, h: number): void {
    const btnY = h - 320;
    const btnW = 250;
    const btnH = 80;

    this.host.btnPlay = this.host.add.container(w / 2 - 160, btnY).setDepth(DEPTH_UI);
    const playBg = this.host.add.graphics();
    playBg.fillStyle(0xc8a878, 1);
    playBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    playBg.lineStyle(1.5, 0x8a6030, 0.85);
    playBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    this.host.btnPlay.add(playBg);

    this.host.btnPlayText = this.host.add.text(0, 0, '出  牌', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
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
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      color: '#7a6a50',
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
