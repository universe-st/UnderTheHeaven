let nextCardId = 1;

export function getNextCardId(): string {
  return 'card-' + (nextCardId++);
}

export function resetCardIdCounter(value: number = 1): void {
  nextCardId = value;
}

export interface Card {
  uid: string;
  suit: 'spade' | 'club' | 'heart' | 'diamond' | null;
  rank: number;
  rankLabel: string;
  consideredAs?: {
    rank: number;
    rankLabel: string;
    suit: string;
  };
  isTemp?: boolean;
}

const SUITS: Array<Card['suit']> = ['spade', 'club', 'heart', 'diamond'];

const RANK_MAP: { [key: number]: string } = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 15: 'A', 20: '2',
};

export function rankToLabel(rank: number): string {
  return RANK_MAP[rank] ?? '?';
}

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20]) {
      deck.push({
        uid: getNextCardId(),
        suit,
        rank,
        rankLabel: RANK_MAP[rank]!,
      });
    }
  }

  deck.push({ uid: getNextCardId(), suit: null, rank: 25, rankLabel: '虎' });
  deck.push({ uid: getNextCardId(), suit: null, rank: 30, rankLabel: '龍' });

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
