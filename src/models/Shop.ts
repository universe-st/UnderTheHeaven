import { PLAYER_CHARACTER_LIST } from './Character';
import type { PlayerCharacterId } from './Character';
import type { BuCiCard, RunState } from './RunState';
import { ROSTER_MAX, BUCI_BAR_MAX } from './RunState';
import type { Card } from './Card';
import { getNextCardId, rankToLabel, SUITS, CARD_RANKS } from './Card';
import { randomSeal, SEAL_PRICE_EXTRA, CARD_SLOT_CHANCE } from './FourSeal';

export type ShopItem =
  | { kind: 'character'; characterId: PlayerCharacterId; price: number }
  | { kind: 'buci'; buci: BuCiCard; price: number }
  | { kind: 'card'; card: Card; price: number }
  | { kind: 'heal'; amount: 10; price: number };

/**
 * 六十四卦·卜辞目录。第一批 = 天宫 8 卦（上卦皆「乾」），全为用户给定。
 * 之后按上卦分组逐宫补齐（地/雷/风/水/火/山/泽 各 8 卦 = 64）。
 */
export const HEXAGRAM_CATALOG: { buci: BuCiCard; price: number }[] = [
  // 乾为天（上乾下乾）
  {
    buci: { id: 'hex_qian_wei_tian', name: '乾为天', upper: '乾', lower: '乾', price: 30, type: 'active', desc: '天命上限 +10，同时天命 +10', effect: { kind: 'destiny_up', maxInc: 10, curInc: 10 }, count: 1 },
    price: 30,
  },
  // 天水讼（上乾下坎）
  {
    buci: { id: 'hex_tian_shui_song', name: '天水讼', upper: '乾', lower: '坎', price: 30, type: 'passive', desc: '抵挡一次战斗失败引起的天命扣减', effect: { kind: 'block_battle_lose_deduction' }, count: 1 },
    price: 30,
  },
  // 天泽履（上乾下兑）
  {
    buci: { id: 'hex_tian_ze_lv', name: '天泽履', upper: '乾', lower: '兑', price: 50, type: 'passive', desc: '天命被扣减到 0 以下时，恢复到 1，避免游戏失败', effect: { kind: 'save_from_zero' }, count: 1 },
    price: 50,
  },
  // 天地否（上乾下坤）
  {
    buci: { id: 'hex_tian_di_pi', name: '天地否', upper: '乾', lower: '坤', price: 30, type: 'active', desc: '扣减 50 点天命上限，恢复 20 点天命', effect: { kind: 'destiny_max_down_cur_up', maxDown: 50, curUp: 20 }, count: 1 },
    price: 30,
  },
  // 天火同人（上乾下离）
  {
    buci: { id: 'hex_tian_huo_tong_ren', name: '天火同人', upper: '乾', lower: '离', price: 20, type: 'passive', desc: '在战斗节点取得胜利则恢复 10 点天命', effect: { kind: 'destiny_up_on_battle_win', amount: 10 }, count: 1 },
    price: 20,
  },
  // 天雷无妄（上乾下震）
  {
    buci: { id: 'hex_tian_lei_wu_wang', name: '天雷无妄', upper: '乾', lower: '震', price: 20, type: 'passive', desc: '在「事件」节点需选择选项时，恢复 10 点天命，随机为你选择一个', effect: { kind: 'event_autopick', amount: 10 }, count: 1 },
    price: 20,
  },
  // 天山遁（上乾下艮）
  {
    buci: { id: 'hex_tian_shan_dun', name: '天山遁', upper: '乾', lower: '艮', price: 30, type: 'passive', desc: '选择「战斗」节点时，跳过战斗，增加 10 点天命', effect: { kind: 'skip_battle', amount: 10 }, count: 1 },
    price: 30,
  },
  // 天风姤（上乾下巽）
  {
    buci: { id: 'hex_tian_feng_gou', name: '天风姤', upper: '乾', lower: '巽', price: 40, type: 'active', desc: '移除一张角色牌，增加 10 点天命；无角色牌不得使用', effect: { kind: 'remove_character', amount: 10 }, count: 1 },
    price: 40,
  },
];

/**
 * 将卦象加入卜辞栏：同卦堆叠（count +1），否则新增一格。
 * 卜辞栏共 3 格，满格时返回 false（不加入）。
 */
export function addBuciToBar(run: RunState, buci: BuCiCard): boolean {
  if (buci.count <= 0) buci.count = 1;
  const existing = run.buciCards.find((c) => c.id === buci.id);
  if (existing) {
    existing.count += buci.count;
    return true;
  }
  if (run.buciCards.length >= 3) {
    return false;
  }
  run.buciCards.push({ ...buci });
  return true;
}

/** 出售卜辞栏中某卦一张：返还售价（购买价一半），count-1，归零移除。 */
export function sellBuci(run: RunState, id: string): number {
  const idx = run.buciCards.findIndex((c) => c.id === id);
  if (idx < 0) return 0;
  const card = run.buciCards[idx]!;
  const refund = Math.floor(card.price / 2);
  card.count -= 1;
  if (card.count <= 0) run.buciCards.splice(idx, 1);
  run.tongbao += refund;
  return refund;
}

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
  qijiguang: 120,
  zhuangzhou: 120,
  weizheng: 75,
  zhangliang: 120,
  xiangyu: 120,
  jiangshang: 120,
  sunbin: 120,
  suqin: 75,
  jingke: 120,
  yiyin: 75,
  hairui: 45,
  chengyaojin: 75,
  hanshizhong: 120,
  zhougongdan: 120,
  tianwen: 120,
  zhouyu: 120,
  dongfangshuo: 75,
  mengke: 120,
  diqing: 120,
  xuda: 120,
  sunwu: 120,
  xiangao: 75,
  tangyin: 120,
  yansong: -120,
  luyu: 75,
  huoqubing: 120,
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
      score: rank,
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
    score: rank,
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
      const entry = HEXAGRAM_CATALOG[Math.floor(rng() * HEXAGRAM_CATALOG.length)]!;
      items.push({ kind: 'buci', buci: { ...entry.buci, count: 1 }, price: entry.price });
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
  // 卜辞栏满格且非同卦（不可堆叠）时不可购买
  if (
    item.kind === 'buci'
    && !run.buciCards.some((c) => c.id === item.buci.id)
    && run.buciCards.length >= BUCI_BAR_MAX
  ) {
    return false;
  }
  run.tongbao -= item.price;
  switch (item.kind) {
    case 'character':
      run.roster.push(item.characterId);
      break;
    case 'buci':
      addBuciToBar(run, item.buci);
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
