import type { Card } from '../models/Card';

/**
 * 周处「除害」纯逻辑（可单测，无 Phaser 依赖）。
 *
 * 规则要点：
 * - 展示对方三张牌，其中的王（大王 龍/rank 30、小王 虎/rank 25，任一即算）移出
 *   对方牌库（不落弃牌堆）。被移出的牌仅本场战斗生效——敌方每场战斗牌库重建，
 *   无需跨战斗记录牌本身；
 * - 「移除过至少一张大王和一张小王」的进度跨战斗累积，存于
 *   battle.player.skillFlags / run.characterSkillFlags；达成后失去【除害】、
 *   获得【励心】（转换结果同样跨战斗永久）。
 * - 三张中无王时，获得其中的红桃牌。
 */

/** 已获得【励心】（同时意味着已失去【除害】）的状态键 */
export const ZHOUCHU_FLAG_HAS_LIXIN = 'zhouchu_has_lixin';

/** 是否移除过大王（龍，rank 30）的状态键 */
export const ZHOUCHU_FLAG_BIG_JOKER = 'zhouchu_removed_big_joker';

/** 是否移除过小王（虎，rank 25）的状态键 */
export const ZHOUCHU_FLAG_SMALL_JOKER = 'zhouchu_removed_small_joker';

/** 除害每次展示的牌数 */
export const CHU_HAI_REVEAL_COUNT = 3;

/** 大王（龍）点数 */
export const BIG_JOKER_RANK = 30;
/** 小王（虎）点数 */
export const SMALL_JOKER_RANK = 25;

/** 从 0..max-1 中随机抽取 count 个不重复索引（不足则全部返回），顺序随机 */
export function pickRandomIndices(count: number, max: number): number[] {
  const indices = Array.from({ length: max }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  return indices.slice(0, Math.min(count, indices.length));
}

/** 是否为王（无花色） */
export function isJoker(card: Card): boolean {
  return card.suit === null;
}

/** 是否为大王（龍，rank 30） */
export function isBigJoker(card: Card): boolean {
  return isJoker(card) && card.rank === BIG_JOKER_RANK;
}

/** 是否为小王（虎，rank 25） */
export function isSmallJoker(card: Card): boolean {
  return isJoker(card) && card.rank === SMALL_JOKER_RANK;
}

/** 一组牌中是否含王（大王或小王，任一） */
export function hasAnyJoker(cards: Card[]): boolean {
  return cards.some(isBigJoker) || cards.some(isSmallJoker);
}

/** 一组牌中同时包含至少一张大王与至少一张小王 */
export function hasBothJokers(cards: Card[]): boolean {
  return cards.some(isBigJoker) && cards.some(isSmallJoker);
}

/** 筛选红桃牌 */
export function heartCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.suit === 'heart');
}

/** 判定是否已达成「移除过至少一张大王和一张小王」（跨战斗累积） */
export function hasRemovedBothJokers(flags: Record<string, boolean | number> | undefined): boolean {
  return !!flags?.[ZHOUCHU_FLAG_BIG_JOKER] && !!flags?.[ZHOUCHU_FLAG_SMALL_JOKER];
}

/** 判定是否已获得【励心】（同时意味着已失去【除害】） */
export function hasLiXin(flags: Record<string, boolean | number> | undefined): boolean {
  return !!flags?.[ZHOUCHU_FLAG_HAS_LIXIN];
}

/** 励心倍率：已累加的伤害数 ×1.5（每步四舍五入取整，伤害为离散值） */
export function applyLiXinMultiplier(accumulated: number): number {
  return Math.round(accumulated * 1.5);
}
