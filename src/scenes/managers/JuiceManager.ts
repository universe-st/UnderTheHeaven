import type Phaser from 'phaser';
import { DEPTH_DAMAGE } from '../../constants/Layout';
import { waitForTween } from '../../utils/AnimationUtils';

export class JuiceManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  hitstop(ms: number = 80): void {
    this.scene.tweens.timeScale = 0.15;
    this.scene.time.delayedCall(ms, () => {
      this.scene.tweens.timeScale = 1;
    });
  }

  shakeForDamage(damage: number, isBomb: boolean): void {
    const cam = this.scene.cameras.main;
    if (isBomb || damage >= 100) {
      cam.shake(300, 0.012);
    } else if (damage >= 50) {
      cam.shake(200, 0.008);
    } else {
      cam.shake(120, 0.004);
    }
  }

  async flashVictimSide(target: 'enemy' | 'player'): Promise<void> {
    const { width, height } = this.scene.scale;
    const centerY = target === 'enemy' ? height / 4 : (height * 3) / 4;
    const flash = this.scene.add.rectangle(width / 2, centerY, width, height / 2, 0xffffff, 0.35)
      .setDepth(DEPTH_DAMAGE - 1);
    await waitForTween(this.scene, {
      targets: flash,
      alpha: 0,
      duration: 150,
      ease: 'Sine.easeOut',
    });
    flash.destroy();
  }
}
