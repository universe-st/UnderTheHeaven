import Phaser from 'phaser';
import { VoiceManager } from '../utils/VoiceManager';

export class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;
  private loadingText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LoadingScene' });
  }

  preload(): void {
    // All visual elements in this scene are built with Graphics — no external
    // assets needed. Game assets are loaded manually in create() so the
    // progress bar reflects real loading progress.
  }

  async create(): Promise<void> {
    const width = Number(this.scale.width) || Number(this.game.config.width) || 2400;
    const height = Number(this.scale.height) || Number(this.game.config.height) || 1080;
    const cx = width / 2;

    this.cameras.main.fadeIn(500);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a0f05, 1);
    bg.fillRect(0, 0, width, height);

    const border = this.add.graphics();
    border.lineStyle(1.5, 0x2a1a0a, 0.6);
    border.strokeRect(20, 20, width - 40, height - 40);

    const corner = this.add.graphics();
    corner.lineStyle(2, 0x4a3020, 0.4);
    corner.lineBetween(16, 16, 16, 80);
    corner.lineBetween(16, 16, 80, 16);
    corner.lineBetween(width - 16, 16, width - 16, 80);
    corner.lineBetween(width - 16, 16, width - 80, 16);
    corner.lineBetween(16, height - 16, 16, height - 80);
    corner.lineBetween(16, height - 16, 80, height - 16);
    corner.lineBetween(width - 16, height - 16, width - 16, height - 80);
    corner.lineBetween(width - 16, height - 16, width - 80, height - 16);

    const centerLine = this.add.graphics();
    centerLine.lineStyle(1, 0x3a2010, 0.3);
    centerLine.lineBetween(0, height * 0.5, width, height * 0.5);
    centerLine.lineBetween(width * 0.5, 0, width * 0.5, height);

    const barW = 480;
    const barH = 24;
    const barX = cx - barW / 2;
    const barY = height * 0.60;

    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0x2a1a0f, 0.8);
    this.progressBox.fillRoundedRect(barX, barY, barW, barH, 5);
    this.progressBox.lineStyle(1.5, 0xc8a050, 0.5);
    this.progressBox.strokeRoundedRect(barX, barY, barW, barH, 5);

    this.progressBar = this.add.graphics();

    this.loadingText = this.add.text(cx, barY + barH + 22, '加载中... 0%', {
      fontSize: '20px',
      fontFamily: '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif',
      color: '#8a7040',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      this.progressBar.clear();
      const fillW = (barW - 4) * value;
      if (fillW > 0) {
        this.progressBar.fillStyle(0xd4a843, 0.85);
        this.progressBar.fillRoundedRect(barX + 2, barY + 2, fillW, barH - 4, 3);
      }
      this.loadingText.setText(`加载中... ${Math.floor(value * 100)}%`);
    });

    this.load.on('complete', () => {
      this.loadingText.setText('加载完成');
      this.time.delayedCall(400, () => {
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          this.scene.start('MenuScene');
        });
      });
    });

    this.loadAssets();
    this.load.start();

    const fontLoaded = await this.loadFontWithRetry('LXGWWenKai', 72, 3);

    this.add.text(cx, height * 0.38, '天 下 牌', {
      fontSize: '90px',
      fontFamily: '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif',
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, height * 0.38 + 58, '一 局 定 天 下', {
      fontSize: '28px',
      fontFamily: '"LXGWWenKai", "Noto Serif SC", "STKaiti", "KaiTi", "楷体", serif',
      color: '#b89050',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0.5);
  }

  private loadAssets(): void {
    this.load.audio('bgm_battle_1', '普通战斗背景1_44100.mp3');
    this.load.audio('bgm_battle_2', '普通战斗背景2_44100.mp3');
    this.load.audio('bgm_battle_3', '普通战斗背景3_44100.mp3');
    this.load.audio('bgm_battle_4', '普通战斗背景4_44100.mp3');
    this.load.audio('victory_jingle', '旌旗归_44100.mp3');
    this.load.audio('bgm_failure', 'bgm_failure_44100.mp3');
    this.load.audio('sfx_hurt', 'sfx_hurt.mp3');
    this.load.audio('sfx_play_card', 'sfx_play_card.mp3');
    this.load.audio('sfx_button', 'sfx_button.mp3');
    this.load.audio('sfx_gong', 'sfx_gong.mp3');
    this.load.audio('sfx_bomb', 'sfx_bomb.mp3');
    this.load.audio('sfx_card_reveal', 'sfx_card_reveal.mp3');
    this.load.audio('sfx_skill_trigger', 'sfx_skill_trigger.mp3');
    this.load.audio('sfx_heal', 'sfx_heal.mp3');
    this.load.image('battle_bg', 'battle_bg.png');
    this.load.image('card_back', 'card_back.png');
    this.load.image('card_pattern_dragon', 'card_pattern_dragon.png');
    this.load.image('card_pattern_tiger', 'card_pattern_tiger.png');

    // 角色头像图片
    this.load.image('char_zhugeliang', 'char_zhugeliang.png');
    this.load.image('char_hanxin', 'char_hanxin.png');
    this.load.image('char_liubowen', 'char_liubowen.png');
    this.load.image('char_lishizhen', 'char_lishizhen.png');
    this.load.image('char_wentianxiang', 'char_wentianxiang.png');
    this.load.image('char_niugao', 'char_niugao.png');
    this.load.image('char_luocheng', 'char_luocheng.png');
    this.load.image('char_xuewanche', 'char_xuewanche.png');
    this.load.image('char_gaoshun', 'char_gaoshun.png');

    // 敌人头像图片
    this.load.image('char_huangjinjun', 'char_huangjinjun.png');
    this.load.image('char_nanmanjun', 'char_nanmanjun.png');
    this.load.image('char_qiangdao', 'char_qiangdao.png');

    for (const voiceKey of VoiceManager.voiceKeys) {
      this.load.audio(voiceKey, `voice/${voiceKey}.mp3`);
    }
  }

  private async loadFontWithRetry(fontFamily: string, size: number, maxRetries: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await document.fonts.load(`${size}px "${fontFamily}"`);
        if (document.fonts.check(`${size}px "${fontFamily}"`)) {
          return true;
        }
      } catch {
        // Fall through to next approach
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        if (document.fonts.check(`${size}px "${fontFamily}"`)) {
          return true;
        }
      } catch {
        // continue
      }
    }
    return false;
  }
}
