import Phaser from 'phaser';
import { gameConfig } from './config';
import { initScreenManager } from './utils/ScreenManager';

// 初始化屏幕管理器（手机浏览器全屏 + 横屏锁定）
initScreenManager();

new Phaser.Game(gameConfig);
