import { CARD_RANKS } from '../models/Card';
import type { Card } from '../models/Card';

/**
 * 【改制】点数序列：3,4,5,6,7,8,9,10,J,Q,K,A,2（`CARD_RANKS` 升序）。
 * 点数最小为 3，最大为 2：+1 后 3→4 … K(13)→A(15)→2(20)，
 * 2 为最大点数，+1 后保持 2，不会继续累加。
 */
export function nextRank(rank: number): number {
  const idx = CARD_RANKS.indexOf(rank);
  if (idx === -1 || idx === CARD_RANKS.length - 1) return rank;
  return CARD_RANKS[idx + 1]!;
}

/** 是否存在非大小王（有花色）的牌——改制可发动的条件 */
export function hasNormalCards(cards: Card[]): boolean {
  return cards.some((c) => c.suit !== null);
}
