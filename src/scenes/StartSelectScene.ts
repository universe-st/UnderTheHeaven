import Phaser from 'phaser';
import type { PlayerCharacterId } from '../models/Character';
import { PLAYER_CHARACTERS } from '../models/Character';
import { randomCheapCharacterChoices, characterPrice } from '../models/Shop';
import * as RunManager from '../models/RunManager';
import { UIFactory } from '../utils/UIFactory';
import { GameAudioManager } from '../utils/GameAudioManager';
import { FONT_FAMILY, AVATAR_SOURCE_SIZE, CURRENCY_ICON_DISPLAY } from '../constants/Layout';

const CHOICE_COUNT = 3;
const CARD_W = 460;
const CARD_H = 620;
const CARD_GAP = 80;
const DESC_FONT_SIZE = 24;
const DESC_WRAP_WIDTH = CARD_W - 60;

/**
 * 开局三选一场景：从最便宜一档随机抽取三位人杰，玩家选择一位作为初始阵容。
 * 选定后创建新局（以所选角色开局）并进入 MapScene；返回则回到主菜单（不创建新局）。
 *
 * 布局（2400×1080）：
 * - 标题 y=0.14h · 分割线 y=0.20h · 说明 y=0.245h
 * - 三张候选卡：cardTop=0.31h，高 620 → 卡底 0.884h；卡间距 80px
 * - 返回按钮 y=0.945h（高 72 → 与卡底 gap≥30px）
 */
export class StartSelectScene extends Phaser.Scene {
  private choices: PlayerCharacterId[] = [];
  private cardContainers: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'StartSelectScene' });
  }

  private resetSceneState(): void {
    this.choices = [];
    for (const c of this.cardContainers) c.destroy();
    this.cardContainers = [];
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.fadeIn(400);

    UIFactory.darkBgWithBorder(this, width, height, 8);

    this.add.text(cx, height * 0.14, '选 择 开 局 人 杰', {
      fontSize: '60px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffdf90',
      stroke: '#3a2010',
      strokeThickness: 4,
    }).setOrigin(0.5);

    UIFactory.divider(this, cx, height * 0.2);

    this.add.text(cx, height * 0.245, '从随机三位人杰（招募价最低档）中选一位，作为本局初始阵容', {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#e8b858',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // 每次进入场景随机抽取三个最便宜一档候选
    this.choices = randomCheapCharacterChoices(CHOICE_COUNT);

    const cardTop = height * 0.31;
    const cardCenterY = cardTop + CARD_H / 2;
    const totalW = this.choices.length * CARD_W + (this.choices.length - 1) * CARD_GAP;
    const startX = (width - totalW) / 2;

    this.choices.forEach((id, i) => {
      const ccx = startX + i * (CARD_W + CARD_GAP) + CARD_W / 2;
      this.createChoiceCard(ccx, cardCenterY, id);
    });

    UIFactory.button(this, cx, height * 0.945, '⌂', '返回主菜单', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.goBack();
    }, { w: 320, h: 72, textStyle: { fontSize: '32px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 3 } });

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
    GameAudioManager.playBgm(this, 'bgm_menu', { loop: true });
  }

  /**
   * 绘制一张候选角色卡。卡内纵向排布（相对卡中心 ccy）：
   * 头像 200px@ccy-195 → 姓名@ccy-50 → 朝代@ccy-2 → 技能名@ccy+44 →
   * 技能描述（UIFactory.wrappedText 中文按字换行，顶部锚定 ccy+72 向下生长）
   * → 招募价@ccy+260。
   * 相邻元素边界 gap ≥ 14px；描述最长约 5 行（ccy+72..+232）仍与价格区 gap ≥ 40px。
   */
  private createChoiceCard(ccx: number, ccy: number, id: PlayerCharacterId): void {
    const char = PLAYER_CHARACTERS[id];
    const container = this.add.container(0, 0);
    this.cardContainers.push(container);

    // 卡面（整卡可点击，hover 提亮金边）
    const bg = this.add.graphics();
    const draw = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(0x1a0a04, 0.85);
      bg.fillRoundedRect(ccx - CARD_W / 2, ccy - CARD_H / 2, CARD_W, CARD_H, 12);
      bg.lineStyle(hover ? 2.5 : 1.5, hover ? 0xe8d5a3 : 0x5a4030, hover ? 1 : 0.7);
      bg.strokeRoundedRect(ccx - CARD_W / 2, ccy - CARD_H / 2, CARD_W, CARD_H, 12);
    };
    draw(false);
    container.add(bg);

    // 头像（512 源图，setScale 缩放）
    const portraitSize = 200;
    const portraitY = ccy - 195;
    const avatarBg = this.add.graphics();
    avatarBg.fillStyle(0x2a1508, 1);
    avatarBg.fillRoundedRect(ccx - portraitSize / 2 - 4, portraitY - portraitSize / 2 - 4, portraitSize + 8, portraitSize + 8, 10);
    container.add(avatarBg);
    const img = this.add.image(ccx, portraitY, `char_${id}`);
    img.setScale(portraitSize / AVATAR_SOURCE_SIZE);
    container.add(img);

    // 姓名
    container.add(this.add.text(ccx, ccy - 50, char.name, {
      fontSize: '42px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffdf90',
      stroke: '#1a0800',
      strokeThickness: 3,
    }).setOrigin(0.5));

    // 朝代
    container.add(this.add.text(ccx, ccy - 2, `【${char.dynasty}】`, {
      fontSize: '26px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#c8a878',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0.5));

    // 技能名
    const visibleAbilities = char.abilities.filter((a) => !a.hidden);
    const skillNames = visibleAbilities.map((a) => a.name).join(' · ');
    container.add(this.add.text(ccx, ccy + 44, skillNames, {
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#e0b878',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0.5));

    // 技能描述：必须用 UIFactory.wrappedText（强制 useAdvancedWrap 中文按字换行，
    // 否则无空格的中文整段不换行会溢出）。顶部锚定向下生长，与下方招募价
    // 留有 ≥40px 余量（候选池最长描述约 5 行，不会触底）。
    const descStr = visibleAbilities.map((a) => a.description).join(' ');
    container.add(UIFactory.wrappedText(this, ccx, ccy + 72, descStr, {
      fontSize: `${DESC_FONT_SIZE}px`,
      fontFamily: FONT_FAMILY,
      color: '#c8a878',
      stroke: '#1a0800',
      strokeThickness: 1,
      align: 'center',
    }, DESC_WRAP_WIDTH).setOrigin(0.5, 0));

    // 招募价（最便宜一档，铜钱图标 + 数字，与黄金台价格样式一致）
    const priceY = ccy + 260;
    const priceGroup = this.add.container(ccx, priceY);
    const coin = this.add.image(0, 0, 'node_tongbao').setOrigin(1, 0.5);
    coin.setScale(CURRENCY_ICON_DISPLAY / coin.width);
    const priceTxt = this.add.text(6, 0, `${characterPrice(id)}`, {
      fontSize: '32px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffdf80',
      stroke: '#1a0800',
      strokeThickness: 2,
    }).setOrigin(0, 0.5);
    priceGroup.add([coin, priceTxt]);
    container.add(priceGroup);

    // 整卡点击选择
    const zone = this.add.zone(ccx, ccy, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.selectCharacter(id);
    });
    container.add(zone);
  }

  private selectCharacter(id: PlayerCharacterId): void {
    // 选定即开局：以所选角色创建新局（覆盖旧存档）并进入地图
    RunManager.startNewRun(undefined, id);
    GameAudioManager.stopBgm(this);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MapScene');
    });
  }

  private goBack(): void {
    GameAudioManager.stopBgm(this);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MenuScene');
    });
  }
}
