import type Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import { GameAudioManager } from '../../utils/GameAudioManager';
import type { CharacterBarManager } from './CharacterBarManager';
import { FONT_FAMILY, AVATAR_SOURCE_SIZE, DEPTH_UI } from '../../constants/Layout';

export interface InfoBarHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  battle: BattleState;

  enemyNameText: Phaser.GameObjects.Text;
  enemyNameFrame: Phaser.GameObjects.Graphics;
  enemyAvatarImage: Phaser.GameObjects.Image;
  enemyAvatarBorder: Phaser.GameObjects.Graphics;
  enemyVitalityBar: Phaser.GameObjects.Graphics;
  enemyVitalityText: Phaser.GameObjects.Text;
  enemyDeckText: Phaser.GameObjects.Text;
  playerNameText: Phaser.GameObjects.Text;
  playerVitalityBar: Phaser.GameObjects.Graphics;
  playerVitalityText: Phaser.GameObjects.Text;
  playerDeckText: Phaser.GameObjects.Text;
}

export class InfoBarManager {
  private host: InfoBarHost;
  private scene: Phaser.Scene;
  private characterBarManager: CharacterBarManager;

  constructor(host: InfoBarHost & Phaser.Scene, characterBarManager: CharacterBarManager) {
    this.host = host;
    this.scene = host;
    this.characterBarManager = characterBarManager;
  }

  createInfoBars(w: number, h: number): void {
    const enemyBarY = 50;
    const enemyBarX = 120;
    const barW = 420;
    const barH = 34;

    this.host.enemyNameText = this.host.add.text(enemyBarX, enemyBarY - 22, '山贼头目', {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      color: '#c8a050',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setShadow(0, 2, '#1a0800', 4, true, true).setDepth(DEPTH_UI);

    // 敌方名字线框（金色边框背景）
    this.host.enemyNameFrame = this.host.add.graphics();
    this.host.enemyNameFrame.setDepth(DEPTH_UI - 1);
    const namePad = 8;
    const nameH = 32;
    this.host.enemyNameFrame.fillStyle(0x2a1a0f, 0.6);
    this.host.enemyNameFrame.fillRoundedRect(enemyBarX - namePad, enemyBarY - 22 - nameH / 2 - namePad, barW + namePad * 2 - 8, nameH + namePad * 2, 4);
    this.host.enemyNameFrame.lineStyle(1.5, 0xb89040, 0.5);
    this.host.enemyNameFrame.strokeRoundedRect(enemyBarX - namePad, enemyBarY - 22 - nameH / 2 - namePad, barW + namePad * 2 - 8, nameH + namePad * 2, 4);

    // 敌人头像（敌人名字左侧，战斗开始后根据 enemyCharacterId 设置纹理）
    const avatarSize = 80;
    const avatarDisplaySize = 68;
    const avatarX = enemyBarX - 66;
    const avatarY = enemyBarY - 2;
    this.host.enemyAvatarBorder = this.host.add.graphics();
    this.host.enemyAvatarBorder.setDepth(DEPTH_UI);
    this.host.enemyAvatarBorder.fillStyle(0x2a1a0f, 0.85);
    this.host.enemyAvatarBorder.fillRoundedRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize, 6);
    this.host.enemyAvatarBorder.lineStyle(2, 0xb89040, 0.7);
    this.host.enemyAvatarBorder.strokeRoundedRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize, 6);
    this.host.enemyAvatarBorder.setVisible(false);

    this.host.enemyAvatarImage = this.host.add.image(avatarX, avatarY, 'char_huangjinjun')
      .setScale(avatarDisplaySize / AVATAR_SOURCE_SIZE)
      .setDepth(DEPTH_UI)
      .setVisible(false);

    this.host.enemyAvatarImage.setInteractive({ cursor: 'pointer' });
    this.host.enemyAvatarImage.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.characterBarManager.showEnemyInfoWindow();
    });

    const enemyBg = this.host.add.graphics();
    enemyBg.setDepth(DEPTH_UI);
    enemyBg.fillStyle(0xf0ebe0, 0.85);
    enemyBg.fillRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);
    enemyBg.lineStyle(1, 0x9a8a6a, 0.6);
    enemyBg.strokeRoundedRect(enemyBarX, enemyBarY + 6, barW, barH, 4);

    this.host.enemyVitalityBar = this.host.add.graphics();
    this.host.enemyVitalityBar.setDepth(DEPTH_UI);
    this.host.enemyVitalityText = this.host.add.text(enemyBarX + barW / 2, enemyBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    // 玩家信息栏（中下方，高于按钮和手牌）
    const playerBarY = h - 380;

    this.host.playerNameText = this.host.add.text(enemyBarX, playerBarY - 16, '玩家', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#4a2a10',
    }).setDepth(DEPTH_UI).setVisible(false);

    const playerBg = this.host.add.graphics();
    playerBg.setDepth(DEPTH_UI);
    playerBg.fillStyle(0xf0ebe0, 0.85);
    playerBg.fillRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);
    playerBg.lineStyle(1, 0x9a8a6a, 0.6);
    playerBg.strokeRoundedRect(enemyBarX, playerBarY + 6, barW, barH, 4);

    this.host.playerVitalityBar = this.host.add.graphics();
    this.host.playerVitalityBar.setDepth(DEPTH_UI);
    this.host.playerVitalityText = this.host.add.text(enemyBarX + barW / 2, playerBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_UI);

    const deckTextX = enemyBarX + barW + 24;
    this.host.enemyDeckText = this.host.add.text(deckTextX, enemyBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI);

    this.host.playerDeckText = this.host.add.text(deckTextX, playerBarY + 6 + barH / 2, '', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      color: '#5a3a20',
    }).setOrigin(0, 0.5).setDepth(DEPTH_UI);
  }
}
