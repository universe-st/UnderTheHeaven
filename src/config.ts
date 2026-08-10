import Phaser from 'phaser';
import { LoadingScene } from './scenes/LoadingScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { MapScene } from './scenes/MapScene';
import { ShopScene } from './scenes/ShopScene';
import { RunEndScene } from './scenes/RunEndScene';
import { TestSelectScene } from './scenes/TestSelectScene';
import { HallOfFameScene } from './scenes/HallOfFameScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 2400,
  height: 1080,
  backgroundColor: '#1a0f05',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [LoadingScene, MenuScene, GameScene, MapScene, ShopScene, RunEndScene, TestSelectScene, HallOfFameScene]
};
