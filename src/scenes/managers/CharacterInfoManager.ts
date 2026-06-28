import Phaser from 'phaser';
import type { BattleState } from '../../models/BattleTypes';
import type { PlayerCharacterId } from '../../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS } from '../../models/Character';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT } from '../../constants/Layout';

/**
 * CharacterBarManager 的辅助管理器：负责角色槽点击后的角色信息 tooltip
 * 以及敌方头像点击后的敌方信息窗口。
 *
 * 这两部分与角色条主职责（槽位渲染/拖拽/光效）相对独立，
 * 共享一个 wrapText 工具，但状态（容器引用）由本类自持。
 */
export interface CharacterInfoHost {
  readonly scale: Phaser.Scale.ScaleManager;
  readonly add: Phaser.GameObjects.GameObjectFactory;
  readonly tweens: Phaser.Tweens.TweenManager;
  battle: BattleState;
  playerCharacterIds: PlayerCharacterId[];
  characterSlotContainers: Phaser.GameObjects.Container[];
  characterBarContainer: Phaser.GameObjects.Container | null;
  enemyAvatarImage: Phaser.GameObjects.Image;
}

export class CharacterInfoManager {
  private host: CharacterInfoHost & Phaser.Scene;

  characterTooltip: Phaser.GameObjects.Container | null = null;
  enemyInfoWindow: Phaser.GameObjects.Container | null = null;

  constructor(host: CharacterInfoHost & Phaser.Scene) {
    this.host = host;
  }

  destroy(): void {
    this.characterTooltip?.destroy();
    this.characterTooltip = null;
    this.enemyInfoWindow?.destroy();
    this.enemyInfoWindow = null;
  }

  showCharacterTooltip(index: number): void {
    this.closeCharacterTooltip();

    const h = this.host;
    const charId = h.playerCharacterIds[index];
    if (!charId) return;

    const char = PLAYER_CHARACTERS[charId];
    const slotContainer = h.characterSlotContainers[index]!;
    const barX = h.characterBarContainer ? h.characterBarContainer.x : 0;
    const barY = h.characterBarContainer ? h.characterBarContainer.y : 0;
    const sx = slotContainer.x + barX;
    const slotY = slotContainer.y + barY;
    const slotSize = 120;

    const tooltipW = 320;
    const tooltipRadius = 8;
    const { width: sw, height: sh } = h.scale;

    const descLinesList: string[][] = [];
    let tooltipH = 50;
    for (const ability of char.abilities) {
      tooltipH += 28;
      const lines = this.wrapText(ability.description, tooltipW - 48, '18px');
      descLinesList.push(lines);
      tooltipH += lines.length * 24;
      tooltipH += 32;
    }
    tooltipH += 12;

    let tooltipX = sx;
    let tooltipY = slotY - slotSize / 2 - tooltipH - 12;
    if (tooltipY < 20) tooltipY = slotY + slotSize / 2 + 12;
    if (tooltipX - tooltipW / 2 < 10) tooltipX = tooltipW / 2 + 10;
    if (tooltipX + tooltipW / 2 > sw - 10) tooltipX = sw - tooltipW / 2 - 10;

    const container = h.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.characterTooltip = container;

    const overlay = h.add.graphics();
    overlay.fillStyle(0x000000, 0.3);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeCharacterTooltip());
    container.add(overlay);

    const panel = h.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.setInteractive(new Phaser.Geom.Rectangle(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const nameText = h.add.text(tooltipX, tooltipY + 28, char.name, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(nameText);

    const divider = h.add.graphics();
    divider.lineStyle(1, 0xd0c4a8, 0.5);
    divider.lineBetween(tooltipX - tooltipW / 2 + 20, tooltipY + 50, tooltipX + tooltipW / 2 - 20, tooltipY + 50);
    container.add(divider);

    let abilityY = tooltipY + 72;
    let lineIdx = 0;
    for (const ability of char.abilities) {
      const skillName = h.add.text(tooltipX - tooltipW / 2 + 22, abilityY, `【${ability.name}】`, {
        fontSize: '20px',
        fontFamily: FONT_FAMILY,
        color: '#8a6030',
      }).setDepth(DEPTH_OVERLAY_TEXT);
      container.add(skillName);

      const descLines = descLinesList[lineIdx]!;
      for (const line of descLines) {
        abilityY += 24;
        const descText = h.add.text(tooltipX - tooltipW / 2 + 28, abilityY, line, {
          fontSize: '18px',
          fontFamily: FONT_FAMILY,
          color: '#5a4a30',
        }).setDepth(DEPTH_OVERLAY_TEXT);
        container.add(descText);
      }
      abilityY += 32;
      lineIdx++;
    }

    const closeText = h.add.text(tooltipX + tooltipW / 2 - 28, tooltipY + 14, '✕', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = h.add.zone(tooltipX + tooltipW / 2 - 28, tooltipY + 14, 36, 36)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(h, 'sfx_button');
      this.closeCharacterTooltip();
    });
    container.add([closeText, closeZone]);

    container.setAlpha(0);
    h.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  closeCharacterTooltip(): void {
    const h = this.host;
    if (!this.characterTooltip) return;
    h.tweens.add({
      targets: this.characterTooltip,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.characterTooltip?.destroy();
        this.characterTooltip = null;
      },
    });
  }

  showEnemyInfoWindow(): void {
    this.closeEnemyInfoWindow();

    const h = this.host;
    const enemyCharId = h.battle.enemyCharacterId;
    if (!enemyCharId) return;

    const enemy = ENEMY_CHARACTERS[enemyCharId];
    if (!enemy) return;

    const tooltipW = 320;
    const tooltipRadius = 8;
    const { width: sw, height: sh } = h.scale;

    const descLinesList: string[][] = [];
    let tooltipH = 50;
    for (const ability of enemy.abilities) {
      tooltipH += 28;
      const lines = this.wrapText(ability.description, tooltipW - 48, '18px');
      descLinesList.push(lines);
      tooltipH += lines.length * 24;
      tooltipH += 32;
    }
    tooltipH += 12;

    const avatarY = h.enemyAvatarImage.y;
    const avatarX = h.enemyAvatarImage.x;
    const avatarSize = 80;
    let tooltipX = avatarX;
    let tooltipY = avatarY + avatarSize / 2 + 12;

    if (tooltipY + tooltipH > sh - 20) tooltipY = avatarY - avatarSize / 2 - tooltipH - 12;
    if (tooltipX - tooltipW / 2 < 10) tooltipX = tooltipW / 2 + 10;
    if (tooltipX + tooltipW / 2 > sw - 10) tooltipX = sw - tooltipW / 2 - 10;

    const container = h.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.enemyInfoWindow = container;

    const overlay = h.add.graphics();
    overlay.fillStyle(0x000000, 0.3);
    overlay.fillRect(0, 0, sw, sh);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, sw, sh), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeEnemyInfoWindow());
    container.add(overlay);

    const panel = h.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH, tooltipRadius);
    panel.setInteractive(new Phaser.Geom.Rectangle(tooltipX - tooltipW / 2, tooltipY, tooltipW, tooltipH), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    const nameText = h.add.text(tooltipX, tooltipY + 28, enemy.name, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#2a1008',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    container.add(nameText);

    const divider = h.add.graphics();
    divider.lineStyle(1, 0xd0c4a8, 0.5);
    divider.lineBetween(tooltipX - tooltipW / 2 + 20, tooltipY + 50, tooltipX + tooltipW / 2 - 20, tooltipY + 50);
    container.add(divider);

    let abilityY = tooltipY + 72;
    let lineIdx = 0;
    for (const ability of enemy.abilities) {
      const skillName = h.add.text(tooltipX - tooltipW / 2 + 22, abilityY, `【${ability.name}】`, {
        fontSize: '20px',
        fontFamily: FONT_FAMILY,
        color: '#8a6030',
      }).setDepth(DEPTH_OVERLAY_TEXT);
      container.add(skillName);

      const descLines = descLinesList[lineIdx]!;
      for (const line of descLines) {
        abilityY += 24;
        const descText = h.add.text(tooltipX - tooltipW / 2 + 28, abilityY, line, {
          fontSize: '18px',
          fontFamily: FONT_FAMILY,
          color: '#5a4a30',
        }).setDepth(DEPTH_OVERLAY_TEXT);
        container.add(descText);
      }
      abilityY += 32;
      lineIdx++;
    }

    const closeText = h.add.text(tooltipX + tooltipW / 2 - 28, tooltipY + 14, '✕', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#7a5a3a',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT);
    const closeZone = h.add.zone(tooltipX + tooltipW / 2 - 28, tooltipY + 14, 36, 36)
      .setInteractive({ cursor: 'pointer' }).setDepth(DEPTH_OVERLAY_TEXT);
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(h, 'sfx_button');
      this.closeEnemyInfoWindow();
    });
    container.add([closeText, closeZone]);

    container.setAlpha(0);
    h.tweens.add({
      targets: container,
      alpha: 1,
      duration: 150,
      ease: 'Sine.easeOut',
    });
  }

  closeEnemyInfoWindow(): void {
    const h = this.host;
    if (!this.enemyInfoWindow) return;
    h.tweens.add({
      targets: this.enemyInfoWindow,
      alpha: 0,
      duration: 100,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.enemyInfoWindow?.destroy();
        this.enemyInfoWindow = null;
      },
    });
  }

  private wrapText(text: string, maxWidth: number, fontSize: string): string[] {
    const h = this.host;
    const lines: string[] = [];
    let currentLine = '';

    const measureText = h.add.text(0, 0, '', { fontSize, fontFamily: FONT_FAMILY });

    for (const ch of text) {
      const testLine = currentLine + ch;
      measureText.setText(testLine);
      if (measureText.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = ch;
      } else {
        currentLine = testLine;
      }
    }

    measureText.destroy();
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
  }
}
