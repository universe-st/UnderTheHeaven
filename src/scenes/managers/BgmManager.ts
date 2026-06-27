import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { DEPTH_CENTER_BASE, DEPTH_DAMAGE } from '../../constants/Layout';
import { loadAudioSettings } from '../../AudioSettings';
import { GameAudioManager } from '../../utils/GameAudioManager';

type GamePhase = 'player_init' | 'player_respond' | 'ai_init' | 'ai_respond' | 'animating' | 'game_over';

interface BgmHost {
  scale: Phaser.Scale.ScaleManager;
  sound: Phaser.Sound.BaseSoundManager;
  tweens: Phaser.Tweens.TweenManager;
  children: Phaser.Structs.List<Phaser.GameObjects.GameObject>;
  phase: GamePhase;
  damageSettlementCancelled: boolean;
  centerCards: Phaser.GameObjects.Container[];
  centerCardsOwner: 'player' | 'enemy' | null;
  centerDepthCounter: number;
  battle: BattleState;
  respondChainDepth: number;
  initActiveSkills(): void;
  updateUIForPhase(): void;
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

  cancelDamageSettlement(): void {
    this.host.damageSettlementCancelled = true;

    const texts = this.scene.children.list.filter(
      c => c instanceof Phaser.GameObjects.Text &&
        (c.depth === DEPTH_DAMAGE || c.depth === DEPTH_DAMAGE + 1)
    ) as Phaser.GameObjects.Text[];

    for (const t of texts) {
      this.scene.tweens.add({
        targets: t,
        x: t.x + 8,
        duration: 30,
        yoyo: true,
        repeat: 5,
        ease: 'Sine.easeInOut',
      });

      this.scene.tweens.add({
        targets: t,
        scaleX: 0.3,
        scaleY: 0.3,
        alpha: 0,
        duration: 400,
        delay: 50,
        ease: 'Back.easeIn',
        onComplete: () => t.destroy(),
      });
    }

    for (const card of this.host.centerCards) {
      this.scene.tweens.add({
        targets: card,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 300,
        ease: 'Sine.easeIn',
        onComplete: () => card.destroy(),
      });
    }
    this.host.centerCards = [];
    this.host.centerCardsOwner = null;
    this.host.centerDepthCounter = DEPTH_CENTER_BASE;

    this.host.battle.turnHolder = 'player';
    this.host.phase = 'player_init';
    this.host.initActiveSkills();
    this.host.updateUIForPhase();
    this.host.respondChainDepth = 0;
  }
}
