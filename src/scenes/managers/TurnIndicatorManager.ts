import type Phaser from 'phaser';
import { FONT_FAMILY, DEPTH_UI } from '../../constants/Layout';

export interface TurnIndicatorHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly tweens: Phaser.Tweens.TweenManager;
}

export class TurnIndicatorManager {
  private host: TurnIndicatorHost & Phaser.Scene;

  private banner: Phaser.GameObjects.Text | null = null;
  private thinking: Phaser.GameObjects.Text | null = null;
  private enemyFrame: Phaser.GameObjects.Graphics | null = null;
  private playerFrame: Phaser.GameObjects.Graphics | null = null;
  private bannerBreath: Phaser.Tweens.Tween | null = null;
  private thinkBreath: Phaser.Tweens.Tween | null = null;
  private frameBreath: Phaser.Tweens.Tween | null = null;

  constructor(host: TurnIndicatorHost & Phaser.Scene) {
    this.host = host;
  }

  create(w: number, h: number): void {
    this.banner = this.host.add.text(w / 2, h - 440, '', {
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#6a4a20',
      stroke: '#f5eeda',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_UI).setVisible(false)
      .setShadow(0, 0, '#ffd700', 10, true, true);

    this.thinking = this.host.add.text(660, 67, '对方思考中…', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
      stroke: '#f0ebe0',
      strokeThickness: 1,
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI).setVisible(false);

    this.enemyFrame = this.host.add.graphics().setDepth(DEPTH_UI + 1).setVisible(false);
    this.enemyFrame.lineStyle(3, 0xffd700, 0.9);
    this.enemyFrame.strokeRoundedRect(8, 8, 540, 92, 8);

    this.playerFrame = this.host.add.graphics().setDepth(DEPTH_UI + 1).setVisible(false);
    this.playerFrame.lineStyle(3, 0xffd700, 0.9);
    this.playerFrame.strokeRoundedRect(104, h - 412, 452, 92, 8);
  }

  showPlayerTurn(text: string): void {
    this.hideThinking();
    this.setFrameActive('player');
    if (!this.banner) return;
    this.banner.setText(text).setVisible(true).setAlpha(0).setScale(0.8);
    this.bannerBreath?.stop();
    this.bannerBreath = null;
    this.host.tweens.add({
      targets: this.banner,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!this.banner?.visible) return;
        this.bannerBreath = this.host.tweens.add({
          targets: this.banner,
          alpha: { from: 0.82, to: 1 },
          duration: 750,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  showAiThinking(): void {
    this.hideBanner();
    this.setFrameActive('enemy');
    if (!this.thinking) return;
    this.thinking.setVisible(true).setAlpha(1);
    this.thinkBreath?.stop();
    this.thinkBreath = this.host.tweens.add({
      targets: this.thinking,
      alpha: { from: 0.4, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  hideAll(): void {
    this.hideBanner();
    this.hideThinking();
    this.setFrameActive(null);
  }

  destroy(): void {
    this.bannerBreath?.stop();
    this.thinkBreath?.stop();
    this.frameBreath?.stop();
    this.bannerBreath = null;
    this.thinkBreath = null;
    this.frameBreath = null;
    this.banner = null;
    this.thinking = null;
    this.enemyFrame = null;
    this.playerFrame = null;
  }

  private hideBanner(): void {
    this.bannerBreath?.stop();
    this.bannerBreath = null;
    this.banner?.setVisible(false).setAlpha(1).setScale(1);
  }

  private hideThinking(): void {
    this.thinkBreath?.stop();
    this.thinkBreath = null;
    this.thinking?.setVisible(false).setAlpha(1);
  }

  private setFrameActive(side: 'player' | 'enemy' | null): void {
    this.frameBreath?.stop();
    this.frameBreath = null;
    this.enemyFrame?.setVisible(false).setAlpha(1);
    this.playerFrame?.setVisible(false).setAlpha(1);
    const frame = side === 'enemy' ? this.enemyFrame : side === 'player' ? this.playerFrame : null;
    if (!frame) return;
    frame.setVisible(true);
    this.frameBreath = this.host.tweens.add({
      targets: frame,
      alpha: { from: 0.35, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
