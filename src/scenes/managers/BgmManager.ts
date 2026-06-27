import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { FONT_FAMILY, DEPTH_DAMAGE, DEPTH_CENTER_BASE } from '../../constants/Layout';
import { loadAudioSettings } from '../../AudioSettings';
import { GameAudioManager } from '../../utils/GameAudioManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface BgmHost {
  scale: Phaser.Scale.ScaleManager;
  sound: Phaser.Sound.BaseSoundManager;
  tweens: Phaser.Tweens.TweenManager;
  children: Phaser.Structs.List<Phaser.GameObjects.GameObject>;
  phase: GamePhase;
  battle: BattleState;
}

export class BgmManager {
  private host: BgmHost & Phaser.Scene;
  private scene: Phaser.Scene;

  private battleBgm: Phaser.Sound.BaseSound | null = null;
  private readonly battleBgmKeys = ['bgm_battle_1', 'bgm_battle_2', 'bgm_battle_3', 'bgm_battle_4', 'bgm_battle_5', 'bgm_battle_6'];
  private currentBattleBgmIndex = -1;

  constructor(host: BgmHost & Phaser.Scene) {
    this.host = host;
    this.scene = host;
  }

  initBattleBgm(): void {
    this.playRandomBattleBgm();
  }

  private playRandomBattleBgm(excludeIndex?: number): void {
    let index: number;
    do {
      index = Math.floor(Math.random() * this.battleBgmKeys.length);
    } while (index === excludeIndex && this.battleBgmKeys.length > 1);

    this.currentBattleBgmIndex = index;
    const settings = loadAudioSettings();
    this.battleBgm = this.scene.sound.add(this.battleBgmKeys[index]!, { loop: false, volume: settings.bgmVolume });
    GameAudioManager.track(this.scene, this.battleBgm);
    this.battleBgm.on('complete', () => this.onBattleBgmComplete());
    this.battleBgm.play();
  }

  private onBattleBgmComplete(): void {
    if (this.host.phase === 'game_over') return;
    this.playRandomBattleBgm(this.currentBattleBgmIndex);
  }

  stopBattleBgm(): void {
    this.battleBgm?.stop();
    this.battleBgm = null;
    this.currentBattleBgmIndex = -1;
  }
}
