import Phaser from 'phaser';
import * as RunManager from '../models/RunManager';
import { MAP_FLOORS } from '../models/RunState';
import { UIFactory } from '../utils/UIFactory';
import { GameAudioManager } from '../utils/GameAudioManager';
import { loadAudioSettings } from '../AudioSettings';
import { FONT_FAMILY } from '../constants/Layout';

interface RunStats {
  floor: number;
  battlesWon: number;
  bossKills: number;
  tongbao: number;
  rosterCount: number;
}

const BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '32px',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
  color: '#ffe9b0',
  stroke: '#2a1008',
  strokeThickness: 3,
};

/**
 * 一局结算场景：进场景时读取战绩后立即清空存档。
 * 胜利 → 天下归一 + victory_jingle；失败 → 天命已尽 + bgm_failure。
 */
export class RunEndScene extends Phaser.Scene {
  private victory = false;
  private stats: RunStats = { floor: 0, battlesWon: 0, bossKills: 0, tongbao: 0, rosterCount: 0 };

  constructor() {
    super({ key: 'RunEndScene' });
  }

  init(data: { victory: boolean }): void {
    this.victory = data?.victory === true;
  }

  private resetSceneState(): void {
    this.stats = { floor: 0, battlesWon: 0, bossKills: 0, tongbao: 0, rosterCount: 0 };
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    const run = RunManager.getRun();
    if (run) {
      this.stats = {
        floor: run.floor,
        battlesWon: run.battlesWon,
        bossKills: run.bossKills,
        tongbao: run.tongbao,
        rosterCount: run.roster.length,
      };
    }
    // 战绩已取出，通关 / 失败均结算完毕，清除存档
    RunManager.clear();

    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.fadeIn(400);

    UIFactory.darkBgWithBorder(this, width, height, 8);

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
    if (this.victory) {
      const jingle = this.sound.add('victory_jingle', { volume: loadAudioSettings().sfxVolume });
      GameAudioManager.track(this, jingle);
      jingle.play();
    } else {
      GameAudioManager.playBgm(this, 'bgm_failure', { loop: false });
    }

    const title = this.add.text(cx, 220, this.victory ? '天 下 归 一' : '天 命 已 尽', {
      fontSize: '92px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: this.victory ? '#ffd980' : '#d05050',
      stroke: '#1a0800',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 400,
      ease: 'Back.easeOut',
    });

    UIFactory.divider(this, cx, 300);

    // 战绩面板
    const panelW = 640;
    const panelH = 400;
    const px = cx - panelW / 2;
    const py = 340;
    UIFactory.panel(this, px, py, panelW, panelH, '战  绩');

    const rows: [string, string][] = [
      ['到达层数', `第 ${Math.min(this.stats.floor, MAP_FLOORS)} / ${MAP_FLOORS} 层`],
      ['战斗胜场', `${this.stats.battlesWon}`],
      ['Boss 击杀', `${this.stats.bossKills}`],
      ['剩余通宝', `${this.stats.tongbao}`],
      ['阵容角色', `${this.stats.rosterCount} 名`],
    ];
    rows.forEach(([label, value], i) => {
      const ry = py + 74 + i * 60;
      this.add.text(px + 80, ry, label, {
        fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#d0a860',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5);
      this.add.text(px + panelW - 80, ry, value, {
        fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#fff0c8',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(1, 0.5);
    });

    UIFactory.button(this, cx - 260, height - 140, '↻', '再来一局', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      RunManager.startNewRun();
      GameAudioManager.stopBgm(this);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MapScene');
      });
    }, { w: 380, h: 76, textStyle: BUTTON_STYLE });

    UIFactory.button(this, cx + 260, height - 140, '⌂', '返回主菜单', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      RunManager.clear();
      GameAudioManager.stopBgm(this);
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('MenuScene');
      });
    }, { w: 380, h: 76, textStyle: BUTTON_STYLE });
  }
}
