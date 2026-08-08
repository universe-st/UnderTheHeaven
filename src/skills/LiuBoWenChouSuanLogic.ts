import type { Card } from '../models/Card';
import { CARD_RANKS } from '../models/Card';

/**
 * 可被「筹策」作为中间点数的有效点数（不含 2 与王）。
 * 注意：点数序列中 K(13) 之后直接是 A(15)，不存在 14 —— 中间点数必须
 * 从有效点数集合中选取，否则 rankToLabel(14) 会渲染成 '?'。
 */
export const PLAYABLE_RANKS: readonly number[] = CARD_RANKS.filter(r => r >= 3 && r <= 15);

/** 严格位于 a、b 两点数之间的有效点数（升序） */
export function middleRanksBetween(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return PLAYABLE_RANKS.filter(r => r > lo && r < hi);
}

/**
 * 「筹策」选牌判定：两张 3~A 之间的普通牌（大王、小王、2 除外），
 * 点数差大于 1，且两点数之间存在至少一个有效中间点数。
 */
export function canUseChouCe(selectedCards: Card[]): boolean {
  if (selectedCards.length !== 2) return false;
  const [a, b] = selectedCards as [Card, Card];
  if (a.rank === 25 || a.rank === 30 || a.rank === 20) return false;
  if (b.rank === 25 || b.rank === 30 || b.rank === 20) return false;
  if (a.rank < 3 || a.rank > 15) return false;
  if (b.rank < 3 || b.rank > 15) return false;
  const diff = Math.abs(a.rank - b.rank);
  if (diff <= 1) return false;
  // 两张牌之间必须存在有效中间点数（K 与 A 之间没有有效点数，不可选）
  return middleRanksBetween(a.rank, b.rank).length > 0;
}
