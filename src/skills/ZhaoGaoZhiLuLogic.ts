import type { Card } from '../models/Card';
import { CARD_RANKS, SUITS, getNextCardId, rankToLabel } from '../models/Card';

/**
 * 指鹿（赵高）技能纯逻辑：随机失去一张最大的牌，生成点数不大于失去牌的临时牌。
 * 与场景/Phaser 解耦，便于单元测试。
 */

/** 2 的点数——最大的普通点数；失去大小王时生成牌的点数上限 */
export const MAX_NORMAL_RANK = 20;

function effectiveRank(card: Card): number {
  return card.consideredAs?.rank ?? card.rank;
}

/** 是否大小王（无花色，虎 25 / 龍 30） */
export function isJoker(card: Card): boolean {
  return card.suit === null;
}

/**
 * 随机选取一张「最大」牌的下标：按有效点数取最大（王 > 2 > A > ... > 3），
 * 多个并列最大时随机取一。
 */
export function pickLargestCardIndex(hand: Card[], rng: () => number = Math.random): number {
  let maxRank = -Infinity;
  const candidates: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const r = effectiveRank(hand[i]!);
    if (r > maxRank) {
      maxRank = r;
      candidates.length = 0;
      candidates.push(i);
    } else if (r === maxRank) {
      candidates.push(i);
    }
  }
  return candidates[Math.floor(rng() * candidates.length)]!;
}

/**
 * 基于失去的牌生成临时牌：随机花色、随机点数（点数不大于失去牌）。
 * 失去的牌是大小王时点数最大为 2（MAX_NORMAL_RANK）。
 */
export function rollTempCard(lostCard: Card, rng: () => number = Math.random): Card | null {
  const maxRank = isJoker(lostCard) ? MAX_NORMAL_RANK : effectiveRank(lostCard);
  const candidates = CARD_RANKS.filter((r) => r <= maxRank);
  if (candidates.length === 0) return null;
  const rank = candidates[Math.floor(rng() * candidates.length)]!;
  const suit = SUITS[Math.floor(rng() * SUITS.length)]!;
  return {
    uid: getNextCardId(),
    suit,
    rank,
    rankLabel: rankToLabel(rank),
    isTemp: true,
  };
}
