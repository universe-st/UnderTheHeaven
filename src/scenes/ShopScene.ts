import Phaser from 'phaser';
import { PLAYER_CHARACTERS } from '../models/Character';
import { ROSTER_MAX } from '../models/RunState';
import * as RunManager from '../models/RunManager';
import type { ShopItem } from '../models/Shop';
import { generateShopStock, purchase, refreshPrice } from '../models/Shop';
import { UIFactory } from '../utils/UIFactory';
import { createPokerCardVisual } from '../utils/CardVisual';
import { GameAudioManager } from '../utils/GameAudioManager';
import { FONT_FAMILY, AVATAR_SOURCE_SIZE } from '../constants/Layout';

const CARD_W = 500;
const CARD_H = 620;
const CARD_GAP = 60;
const CARD_TOP = 240;

/**
 * 黄金台商店：4 件商品（角色 / 卜辞 / 天命回复），每件限购一次。
 * 状态来源全部为 RunManager；离开时 applyVictory 推进层数后回 MapScene。
 */
export class ShopScene extends Phaser.Scene {
  private nodeId = '';
  private stock: ShopItem[] = [];
  private purchased: Set<number> = new Set();
  private refreshCount = 0;
  private stockContainer: Phaser.GameObjects.Container | null = null;
  private refreshButton: Phaser.GameObjects.Container | null = null;
  private destinyText: Phaser.GameObjects.Text | null = null;
  private tongbaoText: Phaser.GameObjects.Text | null = null;
  private rosterText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'ShopScene' });
  }

  init(data: { nodeId: string }): void {
    this.nodeId = data.nodeId;
  }

  private resetSceneState(): void {
    this.stock = [];
    this.purchased = new Set();
    this.refreshCount = 0;
    this.stockContainer?.destroy();
    this.stockContainer = null;
    this.refreshButton?.destroy();
    this.refreshButton = null;
    this.destinyText = null;
    this.tongbaoText = null;
    this.rosterText = null;
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    if (!RunManager.getRun()) {
      RunManager.startNewRun();
    }
    const run = RunManager.getRun()!;
    this.stock = generateShopStock(run, Math.random);

    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.fadeIn(300);

    UIFactory.darkBgWithBorder(this, width, height, 8);

    this.add.text(cx, 90, '黄 金 台', {
      fontSize: '48px',
      fontFamily: FONT_FAMILY,
      color: '#e8d5a3',
      stroke: '#3a2010',
      strokeThickness: 3,
    }).setOrigin(0.5);
    UIFactory.divider(this, cx, 132);

    this.destinyText = this.add.text(cx - 420, 172, '', {
      fontSize: '24px', fontFamily: FONT_FAMILY, color: '#e8d5a3',
    }).setOrigin(0.5);
    this.tongbaoText = this.add.text(cx, 172, '', {
      fontSize: '24px', fontFamily: FONT_FAMILY, color: '#e8d5a3',
    }).setOrigin(0.5);
    this.rosterText = this.add.text(cx + 420, 172, '', {
      fontSize: '24px', fontFamily: FONT_FAMILY, color: '#c8a050',
    }).setOrigin(0.5);
    this.refreshStatus();

    this.buildStock();
    this.buildRefreshButton();

    UIFactory.button(this, cx, height - 90, '◂', '离开黄金台', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.leave();
    }, {
      w: 340, h: 72,
      textStyle: { fontSize: '28px', fontFamily: FONT_FAMILY, color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2 },
    });

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
    GameAudioManager.playBgm(this, 'bgm_menu', { loop: true });
  }

  private refreshStatus(): void {
    const run = RunManager.getRun();
    if (!run) return;
    this.destinyText?.setText(`❤ 天命 ${run.destiny}/${run.destinyMax}`);
    this.tongbaoText?.setText(`💰 通宝 ${run.tongbao}`);
    this.rosterText?.setText(`阵容 ${run.roster.length}/${ROSTER_MAX}`);
  }

  // ── 商品区 ──

  private buildStock(): void {
    this.stockContainer?.destroy();

    const { width } = this.scale;
    const totalW = this.stock.length * CARD_W + (this.stock.length - 1) * CARD_GAP;
    const startX = (width - totalW) / 2;

    const container = this.add.container(0, 0);
    this.stockContainer = container;

    this.stock.forEach((item, i) => {
      const cx = startX + i * (CARD_W + CARD_GAP) + CARD_W / 2;
      const cy = CARD_TOP + CARD_H / 2;
      this.createItemCard(container, item, i, cx, cy);
    });
  }

  private createItemCard(container: Phaser.GameObjects.Container, item: ShopItem, index: number, cx: number, cy: number): void {
    const bought = this.purchased.has(index);
    const run = RunManager.getRun()!;
    const affordable = run.tongbao >= item.price;

    const g = this.add.graphics();
    g.fillStyle(0x1a0a04, 0.7);
    g.fillRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 10);
    g.lineStyle(1.5, bought ? 0x3a2e1c : 0x5a4030, 0.7);
    g.strokeRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 10);
    container.add(g);

    if (item.kind === 'character') {
      const char = PLAYER_CHARACTERS[item.characterId];
      const avatarSize = 180;
      const avatarY = cy - 170;
      const avatarBg = this.add.graphics();
      avatarBg.fillStyle(0x2a1508, 1);
      avatarBg.fillRoundedRect(cx - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize, 8);
      container.add(avatarBg);
      const img = this.add.image(cx, avatarY, `char_${item.characterId}`);
      img.setScale(avatarSize / AVATAR_SOURCE_SIZE);
      container.add(img);

      container.add(this.add.text(cx, cy - 40, char.name, {
        fontSize: '32px', fontFamily: FONT_FAMILY, color: '#e8d5a3',
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy + 4, char.abilities.map((a) => a.name).join(' · '), {
        fontSize: '18px', fontFamily: FONT_FAMILY, color: '#6a5030',
      }).setOrigin(0.5));
    } else if (item.kind === 'buci') {
      container.add(this.add.text(cx, cy - 170, '📜', {
        fontSize: '72px', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy - 60, item.buci.name, {
        fontSize: '28px', fontFamily: FONT_FAMILY, color: '#e8d5a3',
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy - 8, `牌型系数 +${item.buci.coefficientBonus}`, {
        fontSize: '20px', fontFamily: FONT_FAMILY, color: '#8a7040',
      }).setOrigin(0.5));
    } else if (item.kind === 'card') {
      // 与游戏内完全相同的扑克牌卡面样式，放大展示
      const cardVisual = createPokerCardVisual(this, item.card, cx, cy - 50);
      cardVisual.setScale(1.9);
      container.add(cardVisual);
    } else {
      container.add(this.add.text(cx, cy - 170, '❤', {
        fontSize: '72px', fontFamily: FONT_FAMILY, color: '#c05040',
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy - 60, `天命 +${item.amount}`, {
        fontSize: '28px', fontFamily: FONT_FAMILY, color: '#e8d5a3',
      }).setOrigin(0.5));
    }

    // 扑克牌卡面较大：价格与按钮下移，避免压住卡面
    const isCardItem = item.kind === 'card';
    const priceY = isCardItem ? cy + 210 : cy + 120;
    const btnY = isCardItem ? cy + CARD_H / 2 - 40 : cy + CARD_H / 2 - 70;
    container.add(this.add.text(cx, priceY, `💰 ${item.price}`, {
      fontSize: '26px', fontFamily: FONT_FAMILY, color: '#c8a050',
    }).setOrigin(0.5));

    this.createBuyButton(container, item, index, cx, btnY, bought, affordable);
  }

  private createBuyButton(
    container: Phaser.GameObjects.Container,
    item: ShopItem,
    index: number,
    btnX: number,
    btnY: number,
    bought: boolean,
    affordable: boolean,
  ): void {
    const enabled = !bought && affordable;
    const label = bought ? '已 购' : (affordable ? '购 买' : '不 足');

    const btnBg = this.add.graphics();
    const draw = (hover: boolean) => {
      btnBg.clear();
      if (!enabled) {
        btnBg.fillStyle(0x2a1a0f, 0.5);
        btnBg.fillRoundedRect(btnX - 90, btnY - 26, 180, 52, 6);
        btnBg.lineStyle(1, 0x5a4030, 0.4);
        btnBg.strokeRoundedRect(btnX - 90, btnY - 26, 180, 52, 6);
      } else if (hover) {
        btnBg.fillStyle(0x6b3820, 1);
        btnBg.fillRoundedRect(btnX - 90, btnY - 26, 180, 52, 6);
        btnBg.lineStyle(2, 0xe8d5a3, 1);
        btnBg.strokeRoundedRect(btnX - 90, btnY - 26, 180, 52, 6);
      } else {
        btnBg.fillStyle(0x5a3018, 1);
        btnBg.fillRoundedRect(btnX - 90, btnY - 26, 180, 52, 6);
        btnBg.lineStyle(1.5, 0xc8a050, 0.85);
        btnBg.strokeRoundedRect(btnX - 90, btnY - 26, 180, 52, 6);
      }
    };
    draw(false);
    container.add(btnBg);

    container.add(this.add.text(btnX, btnY, label, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: enabled ? '#e8d5a3' : '#5a4030',
    }).setOrigin(0.5));

    if (enabled) {
      const zone = this.add.zone(btnX, btnY, 180, 52).setInteractive({ cursor: 'pointer' });
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this, 'sfx_button');
        this.buy(item, index);
      });
      container.add(zone);
    }
  }

  private buy(item: ShopItem, index: number): void {
    const run = RunManager.getRun();
    if (!run || this.purchased.has(index)) return;
    if (!purchase(run, item)) {
      // 阵容已满等边界情况：刷新 UI 让按钮状态重算
      this.buildStock();
      this.refreshStatus();
      return;
    }
    this.purchased.add(index);
    RunManager.save();
    this.buildStock();
    this.refreshStatus();
  }

  // ── 刷新 ──

  /** 刷新按钮：显示当前刷新价格（5 通宝起，每刷新一次 +1） */
  private buildRefreshButton(): void {
    this.refreshButton?.destroy();
    this.refreshButton = null;
    const { width, height } = this.scale;
    const cx = width / 2;
    const run = RunManager.getRun();
    const price = refreshPrice(this.refreshCount);
    const affordable = !!run && run.tongbao >= price;
    this.refreshButton = UIFactory.button(this, cx - 460, height - 90, '⟳', `刷 新  💰${price}`, () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.refreshStock();
    }, {
      w: 320, h: 72,
      textStyle: {
        fontSize: '26px', fontFamily: FONT_FAMILY,
        color: affordable ? '#e8d5a3' : '#5a4030',
        stroke: '#2a1008', strokeThickness: 2,
      },
    });
  }

  /** 花通宝重新生成 4 件商品；刷新价随次数递增 */
  private refreshStock(): void {
    const run = RunManager.getRun();
    if (!run) return;
    const price = refreshPrice(this.refreshCount);
    if (run.tongbao < price) {
      this.flashNotice('通宝不足，无法刷新');
      return;
    }
    run.tongbao -= price;
    this.refreshCount += 1;
    this.stock = generateShopStock(run, Math.random);
    this.purchased.clear();
    RunManager.save();
    this.buildStock();
    this.refreshStatus();
    this.buildRefreshButton();
  }

  /** 短暂提示（通宝不足等） */
  private flashNotice(message: string): void {
    const { width } = this.scale;
    const cx = width / 2;
    const txt = this.add.text(cx, 205, message, {
      fontSize: '24px', fontFamily: FONT_FAMILY, color: '#d4a843',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: txt,
      alpha: { from: 0, to: 1 },
      duration: 150,
      yoyo: true,
      hold: 900,
      onComplete: () => txt.destroy(),
    });
  }

  // ── 离开 ──

  private leave(): void {
    const run = RunManager.getRun();
    if (run) {
      const node = run.layers.flat().find((n) => n.id === this.nodeId);
      if (node && !node.cleared) {
        // 统一走节点通过结算：推进层数 + 奖励 + 利息（含动画提示数据）
        RunManager.settleNodeClear(node);
      }
      RunManager.save();
    }
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('MapScene');
    });
  }
}
