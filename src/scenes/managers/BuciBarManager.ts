/**
 * 卜辞栏（六十四卦）跨三场景共享组件。
 * 3 格；点击卦象露出「使用」「出售」小标签；被动卦只有「出售」。
 * 使用权限（按 usage 字段 + 上下文）：
 *   - shop：主动卦可「使用」（泽火革→替换商品回调；地图行动卦除外）
 *   - battle：主动技阶段可「使用」（地图行动卦除外）
 *   - map：地图行动卦（震为雷/雷泽归妹）经 onMapAction 回调使用；其余仅展示
 * 出售权限：仅黄金台。
 * 稀有度：边框/角标按 凡/良/珍/传 区分；传说（纯卦）金框加粗。
 * 交互类主动（山泽损/巽为风/风火家人/坤为地/天风姤）在场景弹选牌/选人 UI。
 * 同卦堆叠在同一格（显示 ×count），触发/出售消耗第一张（count-1，归零移出）。
 */
import Phaser from 'phaser';
import type { BuCiCard, BuCiRarity } from '../../models/RunState';
import { hexagramImageKey } from '../../models/RunState';
import * as RunManager from '../../models/RunManager';
import { sellBuci } from '../../models/Shop';
import type { Card } from '../../models/Card';
import { PLAYER_CHARACTERS, type PlayerCharacterId } from '../../models/Character';
import {
  useSimpleActive,
  resolveRemoveCharacter,
  resolveRemoveCardHeal,
  resolveRemoveCardsForTongbao,
  resolveCopyCardToPool,
  resolveGrantSealToPool,
} from '../../engine/BuciEffects';
import { UIFactory } from '../../utils/UIFactory';
import { GameAudioManager } from '../../utils/GameAudioManager';
import { FONT_FAMILY, DEPTH_UI, DEPTH_OVERLAY, AVATAR_SOURCE_SIZE } from '../../constants/Layout';

export type BuciBarContext = 'map' | 'shop' | 'battle';

export interface BuciBarOptions {
  x: number;
  y: number;
  context: BuciBarContext;
  /** 战斗中：当前是否处于主动技可发动阶段 */
  battleActivePhase?: boolean;
  /** 地图：地图行动卦（震为雷/雷泽归妹）「使用」回调（成功后在场景内消耗卦象） */
  onMapAction?: (card: BuCiCard) => void;
  /** 黄金台：泽火革「替换一件商品」回调（场景提供商品选择） */
  onReplaceShopItem?: (card: BuCiCard) => void;
  /** 使用/出售/交互结算后由场景刷新自身显示（天命/通宝等） */
  onStateChanged(): void;
}

const SLOT_W = 116;
const SLOT_H = 100;
const SLOT_GAP = 14;
const HEX_DISPLAY = 56;

/** 稀有度样式：边框色 / 角标 / 角标色 */
const RARITY_STYLE: Record<BuCiRarity, { border: number; label: string; mark: string }> = {
  common: { border: 0x5a4030, label: '凡', mark: '#a89070' },
  fine: { border: 0x2f7d4f, label: '良', mark: '#8fe0a8' },
  rare: { border: 0x2f5d9f, label: '珍', mark: '#a0ccff' },
  legendary: { border: 0xc8a050, label: '传', mark: '#ffd98a' },
};

/** 地图行动卦（只能在 MapScene 使用，需节点选择等交互） */
function isMapAction(card: BuCiCard): boolean {
  return card.effect.kind === 'pass_any_node' || card.effect.kind === 'advance_floor';
}

/** 牌面字符 */
function cardGlyph(c: Card): string {
  if (!c.suit) return c.rank >= 30 ? '龙' : '虎';
  const suitGlyph: Record<string, string> = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
  return `${suitGlyph[c.suit] ?? ''}${c.rankLabel}`;
}

export class BuciBarManager {
  private container: Phaser.GameObjects.Container | null = null;
  private openCardId: string | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly options: BuciBarOptions) {}

  /** 战斗主动技阶段状态变化时调用，重算「使用」可用性 */
  setBattleActivePhase(v: boolean): void {
    this.options.battleActivePhase = v;
    this.refresh();
  }

  refresh(): void {
    this.destroy();
    const run = RunManager.getRun();
    if (!run || run.buciCards.length === 0) return;

    const { x, y } = this.options;
    const container = this.scene.add.container(x, y).setDepth(DEPTH_UI);
    this.container = container;

    const totalW = run.buciCards.length * SLOT_W + (run.buciCards.length - 1) * SLOT_GAP;
    const startX = -totalW / 2;
    run.buciCards.forEach((card, i) => {
      const cx = startX + i * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
      this.renderSlot(container, card, cx);
    });
  }

  destroy(): void {
    this.container?.destroy();
    this.container = null;
    this.openCardId = null;
  }

  private renderSlot(container: Phaser.GameObjects.Container, card: BuCiCard, cx: number): void {
    const selected = this.openCardId === card.id;
    const rarity = RARITY_STYLE[card.rarity];
    const isLegendary = card.rarity === 'legendary';

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a0a04, 0.78);
    bg.fillRoundedRect(cx - SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8);
    bg.lineStyle(selected ? 2.5 : isLegendary ? 2 : 1.2, selected ? 0xe8d5a3 : rarity.border, selected ? 1 : isLegendary ? 1 : 0.7);
    bg.strokeRoundedRect(cx - SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8);
    container.add(bg);

    const img = this.scene.add.image(cx, -16, hexagramImageKey(card.upper, card.lower));
    img.setScale(HEX_DISPLAY / img.width);
    container.add(img);

    container.add(this.scene.add.text(cx, 32, card.name, {
      fontSize: '20px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffd98a',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    if (card.count > 1) {
      container.add(this.scene.add.text(cx + SLOT_W / 2 - 12, -SLOT_H / 2 + 14, `×${card.count}`, {
        fontSize: '18px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf80',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
    }

    // 稀有度角标（左上）
    container.add(this.scene.add.text(cx - SLOT_W / 2 + 16, -SLOT_H / 2 + 14, rarity.label, {
      fontSize: '18px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: rarity.mark,
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    // 地图行动卦角标「行」（右上）
    if (isMapAction(card)) {
      container.add(this.scene.add.text(cx + SLOT_W / 2 - 16, -SLOT_H / 2 + 14, '行', {
        fontSize: '18px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffb060',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
    }

    // 地图：仅地图行动卦可点击（露出「使用」）
    const interactive = this.options.context !== 'map' || isMapAction(card);
    if (interactive) {
      const zone = this.scene.add.zone(cx, 0, SLOT_W, SLOT_H).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.openCardId = this.openCardId === card.id ? null : card.id;
        this.refresh();
      });
      container.add(zone);
    }

    if (selected) {
      this.renderMenu(container, card, cx);
    }
  }

  private renderMenu(container: Phaser.GameObjects.Container, card: BuCiCard, cx: number): void {
    const canUse = card.type === 'active' && this.canUseCard(card);
    const canSell = this.options.context === 'shop';

    let menuY = SLOT_H / 2 + 22;
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '22px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 2,
    };

    if (canUse) {
      const btn = UIFactory.button(this.scene, cx, menuY, '▶', '使 用', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.doUse(card);
      }, { w: 120, h: 44, textStyle: btnStyle });
      container.add(btn);
      menuY += 52;
    }
    if (canSell) {
      const sellLabel = `出售 ${Math.floor(card.price / 2)}`;
      const btn = UIFactory.button(this.scene, cx, menuY, '✕', sellLabel, () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        this.doSell(card);
      }, {
        w: 120, h: 44,
        textStyle: { fontSize: '22px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf80', stroke: '#2a1008', strokeThickness: 2 },
      });
      container.add(btn);
    }
  }

  /** 使用权限：地图行动卦仅地图可用；其余按上下文 + usage */
  private canUseCard(card: BuCiCard): boolean {
    if (isMapAction(card)) {
      return this.options.context === 'map' && !!this.options.onMapAction;
    }
    if (this.options.context === 'map') return false;
    if (this.options.context === 'shop') return card.usage.includes('shop');
    // battle
    return !!this.options.battleActivePhase && card.usage.includes('battle');
  }

  private doUse(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run) return;
    const effect = card.effect;

    // 地图行动卦：交由场景弹节点选择/推进层数，成功后场景消耗卦象
    if (isMapAction(card)) {
      if (!this.options.onMapAction) {
        this.showToast('当前场景无法使用');
        return;
      }
      this.openCardId = null;
      this.refresh();
      this.options.onMapAction(card);
      return;
    }
    // 泽火革：替换一件商品，由黄金台场景弹商品选择
    if (effect.kind === 'replace_shop_item') {
      if (this.options.context !== 'shop' || !this.options.onReplaceShopItem) {
        this.showToast('仅可在黄金台使用');
        return;
      }
      this.openCardId = null;
      this.refresh();
      this.options.onReplaceShopItem(card);
      return;
    }
    // 天风姤：移除角色（已有选人弹窗）
    if (effect.kind === 'remove_character') {
      if (run.roster.length === 0) {
        this.showToast('无角色牌，无法使用');
        return;
      }
      this.openCardId = null;
      this.showCharacterPicker(card);
      return;
    }
    // 牌库交互类主动：选牌弹窗
    if (effect.kind === 'remove_card_heal') {
      if (run.cardPool.length === 0) {
        this.showToast('牌库无牌，无法使用');
        return;
      }
      this.openCardId = null;
      this.showCardPicker(card, '选择要移除的牌（山泽损）', 1, run.cardPool, (uids) => {
        const desc = resolveRemoveCardHeal(run, uids[0]!);
        if (desc) this.afterResolve(`【${card.name}】${desc}`);
      });
      return;
    }
    if (effect.kind === 'remove_cards_for_tongbao') {
      if (run.cardPool.length === 0) {
        this.showToast('牌库无牌，无法使用');
        return;
      }
      this.openCardId = null;
      this.showCardPicker(card, '选择要移除的牌（巽为风，可多选）', 3, run.cardPool, (uids) => {
        const desc = resolveRemoveCardsForTongbao(run, uids);
        if (desc) this.afterResolve(`【${card.name}】${desc}`);
      });
      return;
    }
    if (effect.kind === 'copy_card_to_pool') {
      if (run.cardPool.length === 0) {
        this.showToast('牌库无牌，无法使用');
        return;
      }
      this.openCardId = null;
      this.showCardPicker(card, '选择要复制的牌（风火家人）', 1, run.cardPool, (uids) => {
        const desc = resolveCopyCardToPool(run, uids[0]!);
        if (desc) this.afterResolve(`【${card.name}】${desc}`);
      });
      return;
    }
    if (effect.kind === 'grant_seal_to_pool') {
      if (run.cardPool.length === 0) {
        this.showToast('牌库无牌，无法使用');
        return;
      }
      // 随机抽 candidates 张候选，玩家从中选 pick 张赐玄武印
      const candidates = [...run.cardPool].sort(() => Math.random() - 0.5).slice(0, effect.candidates);
      this.openCardId = null;
      this.showCardPicker(card, '选择赐玄武印的牌（坤为地）', effect.pick, candidates, (uids) => {
        const desc = resolveGrantSealToPool(run, uids);
        if (desc) this.afterResolve(`【${card.name}】${desc}`);
      });
      return;
    }
    // 纯数值类主动（乾为天 / 天地否 / 离为火 等）
    const desc = useSimpleActive(run, card.id);
    if (desc === null) {
      this.showToast('当前无法使用');
      return;
    }
    this.afterResolve(`【${card.name}】${desc}`);
  }

  private doSell(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run) return;
    const refund = sellBuci(run, card.id);
    if (refund <= 0) return;
    this.openCardId = null;
    RunManager.save();
    this.refresh();
    this.options.onStateChanged();
    this.showToast(`出售【${card.name}】 +${refund} 通宝`);
  }

  /** 交互/数值类主动结算后的统一收尾 */
  private afterResolve(message: string): void {
    const run = RunManager.getRun();
    if (!run) return;
    RunManager.save();
    this.refresh();
    this.options.onStateChanged();
    this.showToast(message);
  }

  /** 天风姤：列出阵容角色供玩家选择移除 */
  private showCharacterPicker(card: BuCiCard): void {
    const run = RunManager.getRun();
    if (!run) return;
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const n = run.roster.length;
    const panelW = 720;
    const panelH = 320;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const container = this.scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    container.add(UIFactory.modalOverlay(this.scene, width, height, () => {
      container.destroy();
    }));
    container.add(UIFactory.modalPanel(this.scene, px, py, panelW, panelH, 10));
    container.add(this.scene.add.text(cx, py + 46, '选择要移除的角色（天风姤）', {
      fontSize: '34px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#3a2010',
      stroke: '#f0e8d8', strokeThickness: 3,
    }).setOrigin(0.5));

    const avatarSize = 84;
    const stride = 150;
    const gridX = cx - ((n - 1) / 2) * stride;
    run.roster.forEach((id, i) => {
      const ax = gridX + i * stride;
      const ay = py + 170;
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x2a1508, 1);
      bg.fillRoundedRect(ax - avatarSize / 2, ay - avatarSize / 2, avatarSize, avatarSize, 8);
      container.add(bg);
      const img = this.scene.add.image(ax, ay, `char_${id}`);
      img.setScale(avatarSize / AVATAR_SOURCE_SIZE);
      container.add(img);
      container.add(this.scene.add.text(ax, ay + avatarSize / 2 + 18, PLAYER_CHARACTERS[id].name, {
        fontSize: '22px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#2a1008',
        stroke: '#f0e8d8', strokeThickness: 2,
      }).setOrigin(0.5));

      const zone = this.scene.add.zone(ax, ay, avatarSize, avatarSize + 30).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(this.scene, 'sfx_button');
        container.destroy();
        const desc = resolveRemoveCharacter(run, id as PlayerCharacterId);
        if (desc) this.afterResolve(`【${card.name}】${desc}`);
      });
      container.add(zone);
    });
  }

  /**
   * 通用牌库选牌弹窗（山泽损/巽为风/风火家人/坤为地）。
   * candidates 为可选项（坤为地为随机候选子集）；max 为可多选上限（1 即点选即结算）。
   * 面板尺寸按候选数自适应，最高 2 行 × 5 列；点击遮罩/取消关闭不消耗卦象。
   */
  private showCardPicker(
    card: BuCiCard,
    title: string,
    max: number,
    candidates: Card[],
    onConfirm: (uids: string[]) => void,
  ): void {
    const { width, height } = this.scene.scale;
    const scene = this.scene;
    const cx = width / 2;
    const shown = candidates.slice(0, 10);
    const cols = Math.min(shown.length, 5);
    const rows = Math.max(1, Math.ceil(shown.length / 5));
    const cellW = 150;
    const cellH = 190;
    const panelW = cols * cellW + 120;
    const panelH = rows * cellH + 170;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    const selected = new Set<string>();
    const bgMap = new Map<string, Phaser.GameObjects.Graphics>();

    const container = scene.add.container(0, 0).setDepth(DEPTH_OVERLAY);
    const close = () => {
      container.destroy();
      this.refresh();
    };
    container.add(UIFactory.modalOverlay(scene, width, height, close));
    container.add(UIFactory.modalPanel(scene, px, py, panelW, panelH, 10));
    // panelZone：拦截面板内点击，防止穿透触发遮罩关闭
    container.add(scene.add.zone(px, py, panelW, panelH).setInteractive());

    container.add(scene.add.text(cx, py + 50, title, {
      fontSize: '32px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#3a2010',
      stroke: '#f0e8d8', strokeThickness: 3,
    }).setOrigin(0.5));
    if (max > 1) {
      container.add(scene.add.text(cx, py + 96, `最多选择 ${max} 张`, {
        fontSize: '26px', fontFamily: FONT_FAMILY, color: '#6a4a2a',
        stroke: '#f0e8d8', strokeThickness: 2,
      }).setOrigin(0.5));
    }

    const gridX = px + 60;
    const gridY = py + 130;
    shown.forEach((c, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const ax = gridX + col * cellW + cellW / 2;
      const ay = gridY + row * cellH + cellH / 2;
      const isSel = () => selected.has(c.uid);

      const draw = () => {
        const g = scene.add.graphics();
        g.fillStyle(0x2a1508, 1);
        g.fillRoundedRect(ax - cellW / 2, ay - cellH / 2, cellW, cellH, 10);
        g.lineStyle(isSel() ? 3 : 1.5, isSel() ? 0xe8b040 : 0x6a4a2a, 1);
        g.strokeRoundedRect(ax - cellW / 2, ay - cellH / 2, cellW, cellH, 10);
        container.add(g);
        bgMap.set(c.uid, g);
      };
      draw();

      container.add(scene.add.text(ax, ay - 28, cardGlyph(c), {
        fontSize: '40px', fontFamily: FONT_FAMILY, fontStyle: 'bold',
        color: !c.suit ? '#ffd98a' : (c.suit === 'spade' || c.suit === 'club' ? '#c8c8d8' : '#e06a6a'),
        stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));
      container.add(scene.add.text(ax, ay + 18, `点数 ${c.score}`, {
        fontSize: '24px', fontFamily: FONT_FAMILY, color: '#e8dcc0', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
      if (c.seal) {
        container.add(scene.add.text(ax, ay + 52, c.seal === 'xuanwu' ? '玄印' : '四印', {
          fontSize: '22px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffb060',
          stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5));
      }

      const zone = scene.add.zone(ax, ay, cellW, cellH).setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GameAudioManager.playSfx(scene, 'sfx_button');
        if (max === 1) {
          container.destroy();
          onConfirm([c.uid]);
          return;
        }
        if (selected.has(c.uid)) {
          selected.delete(c.uid);
        } else if (selected.size < max) {
          selected.add(c.uid);
        }
        bgMap.get(c.uid)?.destroy();
        draw();
      });
      container.add(zone);
    });

    if (max > 1) {
      const btnY = py + panelH - 62;
      container.add(UIFactory.button(scene, cx - 130, btnY, '✓', '确 定', () => {
        if (selected.size === 0) return;
        GameAudioManager.playSfx(scene, 'sfx_button');
        container.destroy();
        onConfirm([...selected]);
      }, {
        w: 200, h: 64,
        textStyle: { fontSize: '28px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffe9b0', stroke: '#2a1008', strokeThickness: 3 },
      }));
      container.add(UIFactory.button(scene, cx + 130, btnY, '✕', '取 消', close, {
        w: 200, h: 64,
        textStyle: { fontSize: '28px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffdf80', stroke: '#2a1008', strokeThickness: 3 },
      }));
    }
  }

  /** 短暂浮动提示 */
  private showToast(message: string): void {
    const { width, height } = this.scene.scale;
    const txt = this.scene.add.text(width / 2, height * 0.30, message, {
      fontSize: '30px', fontFamily: FONT_FAMILY, fontStyle: 'bold', color: '#ffd700',
      stroke: '#1a0800', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(DEPTH_OVERLAY);
    this.scene.tweens.add({
      targets: txt,
      alpha: { from: 0, to: 1 },
      duration: 160,
      yoyo: true,
      hold: 900,
      onComplete: () => txt.destroy(),
    });
  }
}
