export interface Card {
  suit: 'spade' | 'club' | 'heart' | 'diamond' | null;
  rank: number;
  rankLabel: string;
}

const SUITS: Array<Card['suit']> = ['spade', 'club', 'heart', 'diamond'];

const RANK_MAP: { [key: number]: string } = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 15: 'A', 20: '2',
};

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20]) {
      deck.push({
        suit,
        rank,
        rankLabel: RANK_MAP[rank],
      });
    }
  }

  deck.push({ suit: null, rank: 25, rankLabel: '虎' });
  deck.push({ suit: null, rank: 30, rankLabel: '龍' });

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 对手牌按大小排序：rank 从小到大（3<4<...<K<A<2<小王<大王），同 rank 按花色（♠<♣<♥<♦）
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
