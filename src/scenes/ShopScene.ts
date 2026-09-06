import Phaser from 'phaser';
import { PLAYER_CHARACTERS } from '../models/Character';
import { ROSTER_MAX, getBuciMods, hexagramImageKey, type BuCiCard } from '../models/RunState';
import * as RunManager from '../models/RunManager';
import type { ShopItem } from '../models/Shop';
import { generateShopStock, purchase, refreshPrice, effectiveRefreshPrice } from '../models/Shop';
import { applyShopEnterHooks, consumeActiveBuci } from '../engine/BuciEffects';
import { UIFactory } from '../utils/UIFactory';
import { createPokerCardVisual } from '../utils/CardVisual';
import { GameAudioManager } from '../utils/GameAudioManager';
import { FONT_FAMILY, AVATAR_SOURCE_SIZE, CURRENCY_ICON_DISPLAY } from '../constants/Layout';
import { BuciBarManager } from './managers/BuciBarManager';

const CARD_W = 500;
const CARD_H = 620;
const CARD_GAP = 60;
const CARD_TOP = 360;

/**
 * 黄金台商店：4 件商品（角色 / 卜辞 / 天命回复），每件限购一次。
 * 状态来源全部为 RunManager；离开时 applyVictory 推进层数后回 MapScene。
 * 顶部为卜辞栏（六十四卦），可在此使用/出售已拥有的卦象。
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
  private tongbaoIcon: Phaser.GameObjects.Image | null = null;
  private rosterText: Phaser.GameObjects.Text | null = null;
  private buciBar: BuciBarManager | null = null;
  private replaceModal: Phaser.GameObjects.Container | null = null;

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
    this.tongbaoIcon = null;
    this.rosterText = null;
    this.buciBar?.destroy();
    this.buciBar = null;
    this.replaceModal?.destroy();
    this.replaceModal = null;
    this.tweens.killAll();
  }

  create(): void {
    this.resetSceneState();

    if (!RunManager.getRun()) {
      RunManager.startNewRun();
    }
    const run = RunManager.getRun()!;
    // 进店卦象（一次性触发 + 常驻每次进店加成）：水风井/泽雷随/雷风恒/风山渐/水地比
    applyShopEnterHooks(run);
    const enterMods = getBuciMods(run);
    if (enterMods.tongbaoPerShop > 0) run.tongbao += enterMods.tongbaoPerShop;
    if (enterMods.healPerShop > 0) run.destiny = Math.min(run.destinyMax, run.destiny + enterMods.healPerShop);
    RunManager.save();
    this.stock = generateShopStock(run, Math.random);

    const { width, height } = this.scale;
    const cx = width / 2;

    this.cameras.main.fadeIn(300);

    UIFactory.darkBgWithBorder(this, width, height, 8);

    this.add.text(cx, 90, '黄 金 台', {
      fontSize: '56px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffdf90',
      stroke: '#3a2010',
      strokeThickness: 4,
    }).setOrigin(0.5);
    UIFactory.divider(this, cx, 132);

    this.destinyText = this.add.text(cx - 420, 172, '', {
      fontSize: '28px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);
    // 通宝：铜钱图标 + 数字（Container 居中组合）
    const tongbaoGroup = this.add.container(cx, 172);
    const coinIcon = this.add.image(0, 0, 'node_tongbao').setOrigin(0, 0.5);
    coinIcon.setScale(CURRENCY_ICON_DISPLAY / coinIcon.width);
    this.tongbaoIcon = coinIcon;
    this.tongbaoText = this.add.text(CURRENCY_ICON_DISPLAY + 6, 0, '', {
      fontSize: '28px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    tongbaoGroup.add([this.tongbaoIcon, this.tongbaoText]);
    this.rosterText = this.add.text(cx + 420, 172, '', {
      fontSize: '28px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf80',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);
    this.refreshStatus();

    this.buildStock();
    this.buildRefreshButton();

    // 卜辞栏（六十四卦）：黄金台可在此使用/出售已拥有卦象
    this.add.text(cx, 195, '卜 辞 栏', {
      fontSize: '26px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#c8a060',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);
    this.buciBar = new BuciBarManager(this, {
      x: cx,
      y: 250,
      context: 'shop',
      onReplaceShopItem: (card) => this.replaceShopItem(card),
      onStateChanged: () => {
        this.refreshStatus();
        this.buildStock();
        this.buildRefreshButton();
      },
    });
    this.buciBar.refresh();

    UIFactory.button(this, cx, height - 90, '◂', '离开黄金台', () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.leave();
    }, {
      w: 340, h: 72,
      textStyle: { fontSize: '32px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 3 },
    });

    GameAudioManager.init(this);
    GameAudioManager.unlock(this);
    GameAudioManager.playBgm(this, 'bgm_menu', { loop: true });
  }

  private refreshStatus(): void {
    const run = RunManager.getRun();
    if (!run) return;
    this.destinyText?.setText(`❤ 天命 ${run.destiny}/${run.destinyMax}`);
    this.tongbaoText?.setText(`通宝 ${run.tongbao}`);
    const rosterMax = ROSTER_MAX + getBuciMods(run).rosterMaxUp; // 地天泰：阵容上限 +1
    this.rosterText?.setText(`阵容 ${run.roster.length}/${rosterMax}`);
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
        fontSize: '36px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf90',
        stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy + 4, char.abilities.map((a) => a.name).join(' · '), {
        fontSize: '22px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#e0b878',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
    } else if (item.kind === 'buci') {
      const hexImg = this.add.image(cx, cy - 160, hexagramImageKey(item.buci.upper, item.buci.lower));
      hexImg.setScale(150 / hexImg.width);
      container.add(hexImg);
      container.add(this.add.text(cx, cy - 55, item.buci.name, {
        fontSize: '34px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf90',
        stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy + 2, item.buci.desc, {
        fontSize: '24px', fontFamily: FONT_FAMILY, color: '#e0b878',
        align: 'center', wordWrap: { width: CARD_W - 40 },
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy + 52, item.buci.type === 'active' ? '主动 · 使用消耗' : '被动 · 触发消耗', {
        fontSize: '22px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#e0b878',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
    } else if (item.kind === 'card') {
      // 与游戏内完全相同的扑克牌卡面样式，放大展示
      const cardVisual = createPokerCardVisual(this, item.card, cx, cy - 50);
      cardVisual.setScale(1.9);
      container.add(cardVisual);
    } else {
      container.add(this.add.text(cx, cy - 170, '❤', {
        fontSize: '76px', fontFamily: FONT_FAMILY, color: '#e06050',
      }).setOrigin(0.5));
      container.add(this.add.text(cx, cy - 60, `天命 +${item.amount}`, {
        fontSize: '32px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf90',
        stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));
    }

    // 扑克牌卡面较大：价格与按钮下移，避免压住卡面
    const isCardItem = item.kind === 'card';
    const priceY = isCardItem ? cy + 210 : cy + 120;
    const btnY = isCardItem ? cy + CARD_H / 2 - 40 : cy + CARD_H / 2 - 70;
    const priceGroup = this.add.container(cx, priceY);
    const coin = this.add.image(0, 0, 'node_tongbao').setOrigin(1, 0.5);
    coin.setScale(CURRENCY_ICON_DISPLAY / coin.width);
    const priceTxt = this.add.text(6, 0, `${item.price}`, {
      fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf80',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    priceGroup.add([coin, priceTxt]);
    container.add(priceGroup);

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
      fontSize: '28px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: enabled ? '#ffe9b0' : '#7a6a50',
      stroke: enabled ? '#2a1008' : 'transparent',
      strokeThickness: 2,
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

  /** 泽火革：选择一件商品替换为随机新商品，替换成功即消耗泽火革 */
  private replaceShopItem(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run || this.replaceModal || this.stock.length === 0) return;
    const { width, height } = this.scale;
    const cx = width / 2;
    const panelW = 760;
    const panelH = 440;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.add.container(0, 0).setDepth(905);
    this.replaceModal = container;
    const close = () => {
      container.destroy();
      this.replaceModal = null;
    };
    container.add(UIFactory.modalOverlay(this, width, height, close));
    container.add(UIFactory.modalPanel(this, px, py, panelW, panelH, 10));
    container.add(this.add.zone(px, py, panelW, panelH).setInteractive());
    container.add(this.add.text(cx, py + 48, '选择要替换的商品（泽火革）', {
      fontSize: '34px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#3a2010',
      stroke: '#f0e8d8', strokeThickness: 3,
    }).setOrigin(0.5));

    const rowH = 64;
    this.stock.forEach((item, i) => {
      const ry = py + 120 + i * (rowH + 14);
      const label = this.itemLabel(item);
      const bg = this.add.graphics();
      bg.fillStyle(0x2a1508, 1);
      bg.fillRoundedRect(px + 60, ry - rowH / 2, panelW - 120, rowH, 8);
      container.add(bg);
      container.add(this.add.text(px + 84, ry, label, {
        fontSize: '26px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));
      container.add(this.add.text(px + panelW - 100, ry, `${item.price} 通宝`, {
        fontSize: '26px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffd98a',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(1, 0.5));
      const zone = this.add.zone(px + 60, ry, panelW - 120, rowH).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this, 'sfx_button');
        // 生成一件随机新商品替换之
        const fresh = generateShopStock(run, Math.random)[0];
        if (!fresh) return;
        this.stock[i] = fresh;
        this.purchased.delete(i);
        consumeActiveBuci(run, card.id);
        RunManager.save();
        close();
        this.buildStock();
        this.refreshStatus();
        this.buciBar?.refresh();
      });
      container.add(zone);
    });
  }

  private itemLabel(item: ShopItem): string {
    switch (item.kind) {
      case 'character':
        return `招募 · ${PLAYER_CHARACTERS[item.characterId].name}`;
      case 'buci':
        return `卜辞 · ${item.buci.name}`;
      case 'card':
        return `扑克牌 · ${item.card.rankLabel}${item.card.seal ? '（带印）' : ''}`;
      case 'heal':
        return '天命回复';
    }
  }

  // ── 刷新 ──

  /** 刷新按钮：显示当前刷新价格（基础 5 起每次 +1；雷风恒固定 / 水山蹇免费） */
  private buildRefreshButton(): void {
    this.refreshButton?.destroy();
    this.refreshButton = null;
    const { width, height } = this.scale;
    const cx = width / 2;
    const run = RunManager.getRun();
    const price = effectiveRefreshPrice(run!, this.refreshCount);
    const affordable = !!run && run.tongbao >= price;
    this.refreshButton = UIFactory.button(this, cx - 460, height - 90, '⟳', `刷 新  ${price}`, () => {
      GameAudioManager.playSfx(this, 'sfx_button');
      this.refreshStock();
    }, {
      w: 320, h: 72,
      textStyle: {
        fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold',
        color: affordable ? '#ffe9b0' : '#7a6a50',
        stroke: '#2a1008', strokeThickness: 3,
      },
    });
  }

  /** 花通宝重新生成 4 件商品；刷新价随次数递增（雷风恒固定 / 水山蹇免费次数优先抵扣） */
  private refreshStock(): void {
    const run = RunManager.getRun();
    if (!run) return;
    const price = effectiveRefreshPrice(run, this.refreshCount);
    if (run.tongbao < price) {
      this.flashNotice('通宝不足，无法刷新');
      return;
    }
    run.tongbao -= price;
    const mods = getBuciMods(run);
    if (mods.freeRefreshCount > 0) {
      // 免费次数抵扣一次（本次刷新免费）
      run.buciMods = { ...mods, freeRefreshCount: mods.freeRefreshCount - 1 };
    }
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
      fontSize: '28px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffd700',
      stroke: '#1a0800', strokeThickness: 3,
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
