import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { FONT_FAMILY } from '../../constants/Layout';

interface HealthBarHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly tweens: Phaser.Tweens.TweenManager;
  battle: BattleState;
  enemyVitalityBar: Phaser.GameObjects.Graphics;
  enemyVitalityText: Phaser.GameObjects.Text;
  playerVitalityBar: Phaser.GameObjects.Graphics;
  playerVitalityText: Phaser.GameObjects.Text;
  enemyDeckText: Phaser.GameObjects.Text;
  playerDeckText: Phaser.GameObjects.Text;
}

export class HealthBarManager {
  private host: HealthBarHost;

  constructor(host: HealthBarHost) {
    this.host = host;
  }

  updateVitalityBars(): void {
    const { height } = this.host.scale;
    const barX = 120;
    const barW = 420;
    const barH = 34;

    this.drawVitalityBar(
      this.host.enemyVitalityBar,
      this.host.enemyVitalityText,
      this.host.battle.enemy.vitality,
      this.host.battle.enemy.vitalityMax,
      barX, 56, barW, barH,
    );
    this.drawVitalityBar(
      this.host.playerVitalityBar,
      this.host.playerVitalityText,
      this.host.battle.player.vitality,
      this.host.battle.player.vitalityMax,
      barX, height - 374, barW, barH,
    );
    this.host.enemyDeckText.setText(`牌堆 ${this.host.battle.enemy.deck.length}`);
    this.host.playerDeckText.setText(`牌堆 ${this.host.battle.player.deck.length}`);
  }

  private drawVitalityBar(
    gfx: Phaser.GameObjects.Graphics,
    text: Phaser.GameObjects.Text,
    current: number,
    max: number,
    barX: number,
    barY: number,
    barW: number,
    barH: number,
  ): void {
    gfx.clear();
    const ratio = Math.max(0, current / max);

    gfx.fillStyle(0xe8dcc8, 0.8);
    gfx.fillRoundedRect(barX, barY, barW, barH, 4);

    let fillColor = 0x60a030;
    if (ratio < 0.3) fillColor = 0xa03030;
    else if (ratio < 0.6) fillColor = 0xc0a030;

    if (ratio > 0) {
      gfx.fillStyle(fillColor, 0.9);
      gfx.fillRoundedRect(barX + 1, barY + 1, (barW - 2) * ratio, barH - 2, 3);
    }

    gfx.lineStyle(1, 0x9a8a6a, 0.6);
    gfx.strokeRoundedRect(barX, barY, barW, barH, 4);

    text.setText(`${current} / ${max}`);
    text.setPosition(barX + barW / 2, barY + barH / 2);
  }

  animateHealthBarDepletion(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
    onComplete: () => void,
  ): void {
    const battleObj = target === 'enemy' ? this.host.battle.enemy : this.host.battle.player;
    const oldVitality = battleObj.vitality;
    const vitObj = { value: oldVitality };

    this.host.tweens.add({
      targets: vitObj,
      value: newVitality,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        battleObj.vitality = Math.round(vitObj.value);
        this.updateVitalityBars();
      },
      onComplete: () => {
        battleObj.vitality = newVitality;
        this.updateVitalityBars();
        onComplete();
      },
    });
  }

  async animateHealthBarDepletionAsync(
    target: 'enemy' | 'player',
    newVitality: number,
    duration: number,
  ): Promise<void> {
    return new Promise(resolve => {
      this.animateHealthBarDepletion(target, newVitality, duration, resolve);
    });
  }
}