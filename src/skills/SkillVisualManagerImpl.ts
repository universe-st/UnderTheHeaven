import type { SkillVisualManager } from './SkillTypes';
import { AudioManager } from '../utils/AudioManager';

const FONT_FAMILY = '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif';
const DEPTH_DAMAGE = 450;

export class SkillVisualManagerImpl implements SkillVisualManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  animateCardScale(
    cards: Phaser.GameObjects.Container | Phaser.GameObjects.Container[],
    scaleTo: number = 1.35,
    duration: number = 300,
  ): void {
    const targets = Array.isArray(cards) ? cards : [cards];
    for (const card of targets) {
      this.scene.tweens.add({
        targets: card,
        scaleX: scaleTo,
        scaleY: scaleTo,
        duration,
        yoyo: true,
        ease: 'Back.easeOut',
      });
    }
  }

  showHeal(target: 'player' | 'enemy', amount: number): void {
    const gameScene = this.scene as any;
    const battle = gameScene.battle;
    const battleObj = target === 'player' ? battle.player : battle.enemy;
    battleObj.vitality = Math.min(battleObj.vitalityMax, battleObj.vitality + amount);

    const { height } = this.scene.scale;
    const barX = 120;
    const barW = 420;
    const barH = 34;
    const barCenterY = target === 'player'
      ? height - 374 + barH / 2
      : 56 + barH / 2;

    const text = this.scene.add.text(barX + barW / 2, barCenterY, `+${amount}`, {
      fontSize: '36px',
      fontFamily: FONT_FAMILY,
      color: '#00ff44',
      stroke: '#003300',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH_DAMAGE);

    this.scene.tweens.add({
      targets: text,
      y: barCenterY - 60,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => {
        text.destroy();
      },
    });

    AudioManager.playSfx(this.scene, 'sfx_heal');
    if (typeof gameScene.updateVitalityBars === 'function') {
      gameScene.updateVitalityBars();
    }
  }

  playSkillTriggerSound(): void {
    AudioManager.playSfx(this.scene, 'sfx_skill_trigger');
  }

  playSfx(key: string): void {
    AudioManager.playSfx(this.scene, key);
  }

  getScene(): Phaser.Scene {
    return this.scene;
  }
}
