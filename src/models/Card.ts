import type { FourSeal } from './FourSeal';

let nextCardId = 1;

export function getNextCardId(): string {
  return 'card-' + (nextCardId++);
}

export const JOKER_MIN_RANK = 25;

export function resetCardIdCounter(value: number = 1): void {
  nextCardId = value;
}

export interface Card {
  uid: string;
  suit: 'spade' | 'club' | 'heart' | 'diamond' | null;
  rank: number;
  rankLabel: string;
  /**
   * 牌面分数（伤害得分基准），与点数 rank 是两个独立概念：
   * 初始等于点数（createDeck 统一初始化），后续技能可单独修改分数而不影响点数。
   */
  score: number;
  consideredAs?: {
    rank: number;
    rankLabel: string;
    suit: string;
  };
  isTemp?: boolean;
  /** 四象印（青龙/白虎/朱雀/玄武），印随牌走，打出时触发效果 */
  seal?: FourSeal;
}

const SUITS: Array<Card['suit']> = ['spade', 'club', 'heart', 'diamond'];
export { SUITS };

/** 普通牌点数（不含王），与 createDeck 一致 */
export const CARD_RANKS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20];

const RANK_MAP: { [key: number]: string } = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 15: 'A', 20: '2',
};

export function rankToLabel(rank: number): string {
  return RANK_MAP[rank] ?? '?';
}

/**
 * 卡牌分数加成的持久化键：`花色_点数`（如 `heart_15`），王牌为 `joker_点数`
 * （`joker_25`=虎/小王、`joker_30`=龍/大王）。
 * 田文「养士」等跨对局分数加成按此键记录（每场战斗牌组重建、uid 不跨场，
 * 键是唯一能在战斗间关联同一张牌的身份）。
 */
export function cardScoreBoostKey(card: Pick<Card, 'suit' | 'rank'>): string {
  return card.suit !== null ? `${card.suit}_${card.rank}` : `joker_${card.rank}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push({
        uid: getNextCardId(),
        suit,
        rank,
        rankLabel: RANK_MAP[rank]!,
        score: rank,
      });
    }
  }

  deck.push({ uid: getNextCardId(), suit: null, rank: 25, rankLabel: '虎', score: 25 });
  deck.push({ uid: getNextCardId(), suit: null, rank: 30, rankLabel: '龍', score: 30 });

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * 对手牌按大小排序：rank 从大到小（大王>小王>2>A>K>...>3），同 rank 按花色（♠<♣<♥<♦）
 */
export function sortHand(hand: Card[]): void {
  const suitOrder: Record<string, number> = {
    spade: 0,
    club: 1,
    heart: 2,
    diamond: 3,
  };
  hand.sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    const aOrder = a.suit ? (suitOrder[a.suit] ?? 0) : 4;
    const bOrder = b.suit ? (suitOrder[b.suit] ?? 0) : 4;
    return aOrder - bOrder;
  });
}

/**
 * Sort played cards for display. Groups by rank multiplicity (most frequent first),
 * then by rank ascending, then by suit (spade < club < heart < diamond).
 * consideredAs cards are sorted after regular cards of the same rank.
 */
export function sortPlayedCards(cards: Card[]): Card[] {
  const rankCounts = new Map<number, number>();
  for (const c of cards) {
    const effectiveRank = c.consideredAs?.rank ?? c.rank;
    rankCounts.set(effectiveRank, (rankCounts.get(effectiveRank) || 0) + 1);
  }

  const suitOrder: Record<string, number> = { spade: 0, club: 1, heart: 2, diamond: 3 };

  return [...cards].sort((a, b) => {
    const rankA = a.consideredAs?.rank ?? a.rank;
    const rankB = b.consideredAs?.rank ?? b.rank;
    const countA = rankCounts.get(rankA)!;
    const countB = rankCounts.get(rankB)!;

    if (countA !== countB) return countB - countA;
    if (rankA !== rankB) return rankA - rankB;

    if (a.consideredAs && !b.consideredAs) return 1;
    if (!a.consideredAs && b.consideredAs) return -1;

    const suitA = a.suit ? (suitOrder[a.suit] ?? 4) : 4;
    const suitB = b.suit ? (suitOrder[b.suit] ?? 4) : 4;
    return suitA - suitB;
  });
}

export function cardDisplayName(card: Card): string {
  const suitSymbol: Record<string, string> = {
    spade: '♠',
    club: '♣',
    heart: '♥',
    diamond: '♦',
  };
  if (card.suit === null) return card.rankLabel;
  return `${suitSymbol[card.suit]}${card.rankLabel}`;
}
