import Phaser from 'phaser';
import type { RunState } from '../../models/RunState';
import type { Card } from '../../models/Card';
import { createDeck, sortHand, cardDisplayName, cardScoreBoostKey } from '../../models/Card';
import { SEAL_LABELS, SEAL_DESCRIPTIONS } from '../../models/FourSeal';
import { UIFactory } from '../../utils/UIFactory';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_OVERLAY, DEPTH_OVERLAY_TEXT } from '../../constants/Layout';

const PANEL_W = 1060;
const PANEL_H = 780;
const COLS = 7;
const ROWS = 8;
const PAGE_SIZE = COLS * ROWS;
const CARD_W = 128;
const CARD_H = 66;
const STRIDE_X = 144;
const STRIDE_Y = 82;

const SUIT_SYMBOLS: Record<string, string> = {
  spade: '♠',
  club: '♣',
  heart: '♥',
  diamond: '♦',
};

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '36px', fontFamily: FONT_FAMILY, color: '#3a2010',
};
const BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '26px', fontFamily: FONT_FAMILY, color: '#e8d5a3', stroke: '#2a1008', strokeThickness: 2,
};

/**
 * 展示用牌组：标准牌 + 黄金台购买牌，应用田文「养士」等跨对局分数加成。
 * 与 GameScene.initBattle 的牌组构建逻辑保持一致，保证地图所见即战斗所用。
 */
function buildDeck(run: RunState): Card[] {
  const deck: Card[] = createDeck();
  for (const card of run.cardPool) {
    deck.push({ ...card });
  }
  const boosts = run.scoreBoosts;
  if (boosts) {
    for (const card of deck) {
      const boost = boosts[cardScoreBoostKey(card)];
      if (boost) card.score += boost;
    }
  }
  sortHand(deck);
  return deck;
}

/**
 * 地图牌组弹窗：展示玩家牌库全部牌（标准 54 张 + 黄金台购买牌，含分数加成），
 * 点击单张牌弹出小窗显示牌名、四象印效果、分数。
 */
export class DeckModal {
  private container: Phaser.GameObjects.Container | null = null;
  private infoContainer: Phaser.GameObjects.Container | null = null;
  private page = 0;
  private pages: Card[][] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(run: RunState): void {
    this.close();
    const deck = buildDeck(run);
    this.pages = [];
    for (let i = 0; i < deck.length; i += PAGE_SIZE) {
      this.pages.push(deck.slice(i, i + PAGE_SIZE));
    }
    this.page = 0;
    this.render();
  }

  close(): void {
    this.closeInfo();
    this.container?.destroy();
    this.container = null;
  }

  private closeInfo(): void {
    this.infoContainer?.destroy();
    this.infoContainer = null;
  }

  private render(): void {
    this.close();
    if (this.pages.length === 0) return;

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const px = (width - PANEL_W) / 2;
    const py = (height - PANEL_H) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    this.container = container;

    container.add(UIFactory.modalOverlay(this.scene, width, height, () => this.close()));
    container.add(UIFactory.modalPanel(this.scene, px, py, PANEL_W, PANEL_H, 10));

    container.add(this.scene.add.text(cx, py + 50, '牌  组', TITLE_STYLE).setOrigin(0.5));

    const closeText = this.scene.add.text(px + PANEL_W - 40, py + 32, '✕', {
      fontSize: '32px', fontFamily: FONT_FAMILY, color: '#7a5a3a',
    }).setOrigin(0.5);
    const closeZone = this.scene.add.zone(px + PANEL_W - 40, py + 32, 52, 52).setInteractive({ cursor: 'pointer' });
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.close();
    });
    container.add([closeText, closeZone]);

    // 牌网格（标准 54 张恰好一页，购买牌多时分页）
    const cards = this.pages[this.page]!;
    const gridX = px + (PANEL_W - (COLS - 1) * STRIDE_X - CARD_W) / 2 + CARD_W / 2;
    const gridY = py + 128;
    cards.forEach((card, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      container.add(this.createCardTile(card, gridX + col * STRIDE_X, gridY + row * STRIDE_Y));
    });

    // 分页控件（仅多页时显示）
    if (this.pages.length > 1) {
      container.add(this.scene.add.text(cx, py + PANEL_H - 56, `第 ${this.page + 1} / ${this.pages.length} 页`, {
        fontSize: '22px', fontFamily: FONT_FAMILY, color: '#7a5a3a',
      }).setOrigin(0.5));
      container.add(UIFactory.button(this.scene, px + 120, py + PANEL_H - 56, '‹', '上一页', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.page = Math.max(0, this.page - 1);
        this.render();
      }, { w: 180, h: 60, textStyle: BUTTON_STYLE }));
      container.add(UIFactory.button(this.scene, px + PANEL_W - 120, py + PANEL_H - 56, '›', '下一页', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.page = Math.min(this.pages.length - 1, this.page + 1);
        this.render();
      }, { w: 180, h: 60, textStyle: BUTTON_STYLE }));
    }
  }

  private createCardTile(card: Card, x: number, y: number): Phaser.GameObjects.Container {
    const tile = this.scene.add.container(0, 0);
    tile.setDepth(DEPTH_OVERLAY_TEXT);

    const g = this.scene.add.graphics();
    const draw = (fill: number, stroke: number) => {
      g.clear();
      g.fillStyle(fill, 1);
      g.fillRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 8);
      g.lineStyle(1.5, stroke, 0.9);
      g.strokeRoundedRect(x - CARD_W / 2, y - CARD_H / 2, CARD_W, CARD_H, 8);
    };
    draw(0xefe6d2, 0xb8a070);
    tile.add(g);

    const isRed = card.suit === 'heart' || card.suit === 'diamond';
    const nameColor = card.suit === null ? '#8a6a20' : (isRed ? '#a03020' : '#2a2018');
    tile.add(this.scene.add.text(x, y - 9, cardDisplayName(card), {
      fontSize: '24px', fontFamily: FONT_FAMILY, color: nameColor,
    }).setOrigin(0.5));

    const sealName = card.seal ? SEAL_LABELS[card.seal] : '';
    tile.add(this.scene.add.text(x, y + 17, `分 ${card.score}${sealName ? ` · ${sealName}印` : ''}`, {
      fontSize: '16px', fontFamily: FONT_FAMILY, color: '#6a5a40',
    }).setOrigin(0.5));

    const zone = this.scene.add.zone(x, y, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
    zone.on('pointerover', () => draw(0xf8f0dc, 0xc8a050));
    zone.on('pointerout', () => draw(0xefe6d2, 0xb8a070));
    zone.on('pointerdown', () => {
      GameAudioManager.playSfx(this.scene, 'sfx_button');
      this.showCardInfo(card);
    });
    tile.add(zone);
    return tile;
  }

  /** 点击单张牌弹出的小窗口：牌名、分数、四象印效果 */
  private showCardInfo(card: Card): void {
    this.closeInfo();

    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;
    const w = 460;
    const h = 260;
    const px = cx - w / 2;
    const py = cy - h / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY_TEXT);
    this.infoContainer = container;

    // 半透明遮罩：点击窗口外任意位置关闭
    const overlay = this.scene.add.graphics();
    overlay.fillStyle(0x000000, 0.35);
    overlay.fillRect(0, 0, width, height);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerdown', () => this.closeInfo());
    container.add(overlay);

    const panel = this.scene.add.graphics();
    panel.fillStyle(0xf5f0e5, 0.97);
    panel.fillRoundedRect(px, py, w, h, 10);
    panel.lineStyle(2, 0x8a6830, 0.8);
    panel.strokeRoundedRect(px, py, w, h, 10);
    panel.setInteractive(new Phaser.Geom.Rectangle(px, py, w, h), Phaser.Geom.Rectangle.Contains);
    container.add(panel);

    // 标题：牌名（王牌区分大小王）
    const isRed = card.suit === 'heart' || card.suit === 'diamond';
    const nameColor = card.suit === null ? '#8a6a20' : (isRed ? '#a03020' : '#2a2018');
    const titleText = card.suit !== null
      ? `${SUIT_SYMBOLS[card.suit]} ${card.rankLabel}`
      : `${card.rankLabel} ${card.rank === 30 ? '大王' : '小王'}`;
    container.add(this.scene.add.text(cx, py + 44, titleText, {
      fontSize: '34px', fontFamily: FONT_FAMILY, color: nameColor,
    }).setOrigin(0.5));

    container.add(this.scene.add.text(cx, py + 108, `分数：${card.score}`, {
      fontSize: '24px', fontFamily: FONT_FAMILY, color: '#5a4a30',
    }).setOrigin(0.5));

    if (card.seal) {
      container.add(this.scene.add.text(cx, py + 162, `【${SEAL_LABELS[card.seal]}】${SEAL_DESCRIPTIONS[card.seal]}`, {
        fontSize: '22px', fontFamily: FONT_FAMILY, color: '#8a6030',
      }).setOrigin(0.5));
    } else {
      container.add(this.scene.add.text(cx, py + 162, '（无四象印）', {
        fontSize: '20px', fontFamily: FONT_FAMILY, color: '#a09080',
      }).setOrigin(0.5));
    }

    const closeText = this.scene.add.text(px + w - 34, py + 26, '✕', {
      fontSize: '30px', fontFamily: FONT_FAMILY, color: '#7a5a3a',
    }).setOrigin(0.5);
    const closeZone = this.scene.add.zone(px + w - 34, py + 26, 48, 48).setInteractive({ cursor: 'pointer' });
    closeZone.on('pointerover', () => closeText.setColor('#2a1008'));
    closeZone.on('pointerout', () => closeText.setColor('#7a5a3a'));
    closeZone.on('pointerdown', () => this.closeInfo());
    container.add([closeText, closeZone]);
  }
}
