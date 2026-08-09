import { HandType } from './BattleTypes';
import { PLAYER_CHARACTER_LIST } from './Character';
import type { PlayerCharacterId } from './Character';
import type { BuCiCard, RunState } from './RunState';
import { ROSTER_MAX } from './RunState';
import type { Card } from './Card';
import { getNextCardId, rankToLabel, SUITS, CARD_RANKS } from './Card';
import { randomSeal, SEAL_PRICE_EXTRA, CARD_SLOT_CHANCE } from './FourSeal';

export type ShopItem =
  | { kind: 'character'; characterId: PlayerCharacterId; price: number }
  | { kind: 'buci'; buci: BuCiCard; price: number }
  | { kind: 'card'; card: Card; price: number }
  | { kind: 'heal'; amount: 10; price: number };

/** 卜辞牌目录：按牌型提供伤害系数加成，价格按强度定（30-80） */
export const BUCI_CATALOG: { buci: BuCiCard; price: number }[] = [
  { buci: { id: 'buci_pojun_single', name: '破军·单张', handType: HandType.Single, coefficientBonus: 0.5 }, price: 80 },
  { buci: { id: 'buci_pojun_pair', name: '破军·对子', handType: HandType.Pair, coefficientBonus: 0.4 }, price: 60 },
  { buci: { id: 'buci_pojun_triple', name: '破军·三张', handType: HandType.Triple, coefficientBonus: 0.4 }, price: 55 },
  { buci: { id: 'buci_pojun_straight', name: '破军·顺子', handType: HandType.Straight, coefficientBonus: 0.4 }, price: 50 },
  { buci: { id: 'buci_pojun_bomb', name: '破军·炸弹', handType: HandType.Bomb, coefficientBonus: 0.3 }, price: 30 },
];

/** 角色售价 = 招募费用 × 15 */
export const CHARACTER_PRICE_FACTOR = 15;
export const HEAL_ITEM: ShopItem = { kind: 'heal', amount: 10, price: 30 };

/**
 * 角色售价表（原“费用 × 15”折算）：3 → 45、5 → 75、8 → 120。
 * 费用属性已从角色数据中移除，定价直接在此维护。
 */
export const CHARACTER_PRICES: Record<PlayerCharacterId, number> = {
  bianque: 45,
  hanxin: 120,
  liubowen: 75,
  lishizhen: 45,
  zhugeliang: 120,
  wentianxiang: 75,
  libai: 120,
  niugao: 45,
  luocheng: 75,
  xuewanche: 75,
  gaoshun: 75,
  zhangfei: 75,
  zhanghan: 75,
  zuchongzhi: 75,
  guanyu: 120,
  lanyu: 75,
  zhaogao: -30,
  zhangjuzheng: 75,
  zhouchu: 120,
  baozheng: 120,
  lvbuwei: 120,
  huamulan: 75,
  shangguanwaner: 120,
  liqingzhao: 120,
};

/** 黄金台刷新费用：基础 5 通宝，每刷新一次 +1 */
export const REFRESH_BASE_PRICE = 5;

export function refreshPrice(refreshCount: number): number {
  return REFRESH_BASE_PRICE + refreshCount;
}

const SHOP_STOCK_SIZE = 4;
const HEAL_CHANCE = 0.3;

export function characterPrice(characterId: PlayerCharacterId): number {
  const price = CHARACTER_PRICES[characterId];
  if (price === undefined) {
    throw new Error(`未知角色: ${characterId}`);
  }
  return price;
}

/** 扑克牌售价 = 点数（虎 25 / 龙 30），带印再加价 */
export function cardPrice(card: Card): number {
  return card.rank + (card.seal ? SEAL_PRICE_EXTRA : 0);
}

/** 生成一张随机的标准扑克牌（54 张等概率），25% 概率带四印之一 */
export function randomShopCard(rng: () => number): Card {
  const normalCount = SUITS.length * CARD_RANKS.length; // 52
  const total = normalCount + 2; // + 虎 / 龙
  const r = Math.floor(rng() * total);
  if (r >= normalCount) {
    const rank = r === total - 1 ? 30 : 25;
    return {
      uid: getNextCardId(),
      suit: null,
      rank,
      rankLabel: rankToLabel(rank),
      seal: randomSeal(rng) ?? undefined,
    };
  }
  const suit = SUITS[Math.floor(r / CARD_RANKS.length)]!;
  const rank = CARD_RANKS[r % CARD_RANKS.length]!;
  return {
    uid: getNextCardId(),
    suit,
    rank,
    rankLabel: rankToLabel(rank),
    seal: randomSeal(rng) ?? undefined,
  };
}

/**
 * 生成 4 件商店商品：1-2 个未招募角色（阵容满 10 个则不出角色）、
 * 其余为卜辞牌 / 扑克牌（每个卜辞槽位按 CARD_SLOT_CHANCE 概率变为扑克牌槽位），
 * 约 30% 概率含 1 个天命回复。
 */
export function generateShopStock(run: RunState, rng: () => number): ShopItem[] {
  const items: ShopItem[] = [];
  const wantHeal = rng() < HEAL_CHANCE;

  const rosterFull = run.roster.length >= ROSTER_MAX;
  const unrecruited = PLAYER_CHARACTER_LIST.filter((c) => !run.roster.includes(c.id));
  const maxCharSlots = wantHeal ? 2 : 3;
  const charCount = rosterFull ? 0 : Math.min(1 + Math.floor(rng() * 2), unrecruited.length, maxCharSlots);

  // 随机选取不重复的未招募角色
  const pool = [...unrecruited];
  for (let i = 0; i < charCount; i++) {
    const idx = Math.floor(rng() * pool.length);
    const character = pool.splice(idx, 1)[0]!;
    items.push({ kind: 'character', characterId: character.id, price: characterPrice(character.id) });
  }

  const slotCount = SHOP_STOCK_SIZE - charCount - (wantHeal ? 1 : 0);
  for (let i = 0; i < slotCount; i++) {
    if (rng() < CARD_SLOT_CHANCE) {
      // 扑克牌槽位：购买后进入己方牌库
      const card = randomShopCard(rng);
      items.push({ kind: 'card', card, price: cardPrice(card) });
    } else {
      const entry = BUCI_CATALOG[Math.floor(rng() * BUCI_CATALOG.length)]!;
      items.push({ kind: 'buci', buci: { ...entry.buci }, price: entry.price });
    }
  }

  if (wantHeal) {
    items.push({ ...HEAL_ITEM });
  }

  return items;
}

/**
 * 购买商品：通宝不足（或阵容已满仍买角色）返回 false 且状态不变；
 * 成功则扣款并入账（角色入阵容、卜辞入 buciCards、扑克牌入 cardPool、回复天命不超上限）。
 */
export function purchase(run: RunState, item: ShopItem): boolean {
  if (run.tongbao < item.price) {
    return false;
  }
  if (item.kind === 'character' && (run.roster.length >= ROSTER_MAX || run.roster.includes(item.characterId))) {
    return false;
  }
  run.tongbao -= item.price;
  switch (item.kind) {
    case 'character':
      run.roster.push(item.characterId);
      break;
    case 'buci':
      run.buciCards.push({ ...item.buci });
      break;
    case 'card':
      run.cardPool.push({ ...item.card });
      break;
    case 'heal':
      run.destiny = Math.min(run.destinyMax, run.destiny + item.amount);
      break;
  }
  return true;
}
