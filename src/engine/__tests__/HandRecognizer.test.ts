import { describe, it, expect } from 'vitest';
import type { Card} from '../../models/Card';
import { createDeck, getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { HandPattern} from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { identifyHand, findAllPlays, canBeat, findBeatingPlays, rankForOrder } from '../HandRecognizer';

function makeCard(rank: number, suit: Card['suit'] = 'spade'): Card {
  return { uid: getNextCardId(), suit, rank, rankLabel: rank <= 13 ? String(rank) : rank < 25 ? ['A', '2'][rank - 15]! : rank === 25 ? '虎' : '龍', score: rank };
}

function makeCards(ranks: number[], suits?: Card['suit'][][]): Card[] {
  const defaultSuits = ['spade', 'club', 'heart', 'diamond'];
  return ranks.map((r, i) => {
    if (suits && i < suits.length && suits[i]) {
      return makeCard(r, suits[i]![0] as Card['suit']);
    }
    return makeCard(r, defaultSuits[i % 4] as Card['suit']);
  });
}

describe('rankForOrder', () => {
  it('maps A to 14', () => expect(rankForOrder(15)).toBe(14));
  it('maps 2 to 15', () => expect(rankForOrder(20)).toBe(15));
  it('maps 小王 to 16', () => expect(rankForOrder(25)).toBe(16));
  it('maps 大王 to 17', () => expect(rankForOrder(30)).toBe(17));
});

describe('identifyHand', () => {
  it('returns null for empty array', () => {
    expect(identifyHand([])).toBeNull();
  });

  it('identifies single', () => {
    const result = identifyHand(makeCards([3]));
    expect(result?.type).toBe(HandType.Single);
    expect(result?.mainValue).toBe(3);
  });

  it('identifies pair', () => {
    const cards = makeCards([5, 5]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Pair);
  });

  it('identifies triple', () => {
    const cards = makeCards([8, 8, 8]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Triple);
  });

  it('identifies triple-one', () => {
    const cards = makeCards([8, 8, 8, 3]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.TripleOne);
  });

  it('identifies triple-pair', () => {
    const cards = makeCards([8, 8, 8, 3, 3]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.TriplePair);
  });

  it('identifies straight (5 cards)', () => {
    const cards = makeCards([3, 4, 5, 6, 7]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Straight);
    expect(result?.length).toBe(5);
  });

  it('identifies consecutive pairs', () => {
    const cards = makeCards([3, 3, 4, 4, 5, 5]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.ConsecutivePairs);
    expect(result?.length).toBe(3);
  });

  it('identifies bomb', () => {
    const cards = makeCards([7, 7, 7, 7]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Bomb);
    expect(result?.length).toBe(4);
  });

  it('identifies bomb with 5+ same cards (length = card count)', () => {
    const five = identifyHand(makeCards([7, 7, 7, 7, 7]));
    expect(five?.type).toBe(HandType.Bomb);
    expect(five?.length).toBe(5);
    const eight = identifyHand(makeCards([7, 7, 7, 7, 7, 7, 7, 7]));
    expect(eight?.type).toBe(HandType.Bomb);
    expect(eight?.length).toBe(8);
  });

  it('identifies rocket', () => {
    const cards = makeCards([25, 30]);
    cards[0]!.rankLabel = '虎';
    cards[1]!.rankLabel = '龍';
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Rocket);
    expect(result?.length).toBe(1);
  });

  it('identifies multi-pair rocket (length = pair count)', () => {
    const twoPairs = identifyHand(makeCards([25, 25, 30, 30]));
    expect(twoPairs?.type).toBe(HandType.Rocket);
    expect(twoPairs?.length).toBe(2);
    const threePairs = identifyHand(makeCards([25, 25, 25, 30, 30, 30]));
    expect(threePairs?.type).toBe(HandType.Rocket);
    expect(threePairs?.length).toBe(3);
  });

  it('does not identify uneven joker counts as rocket', () => {
    expect(identifyHand(makeCards([25, 25, 30]))).toBeNull();
    expect(identifyHand(makeCards([25, 25, 25, 30]))?.type).toBe(HandType.TripleOne);
  });

  it('identifies airplane (2 triples)', () => {
    const cards = makeCards([3, 3, 3, 4, 4, 4]);
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Airplane);
  });
});

describe('canBeat', () => {
  it('higher single beats lower single', () => {
    const single3: HandPattern = { type: HandType.Single, cards: makeCards([3]), mainValue: 3, length: 1 };
    const single5: HandPattern = { type: HandType.Single, cards: makeCards([5]), mainValue: 5, length: 1 };
    expect(canBeat(single5, single3)).toBe(true);
    expect(canBeat(single3, single5)).toBe(false);
  });

  it('bomb beats non-bomb', () => {
    const bomb: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 3, length: 4 };
    const single: HandPattern = { type: HandType.Single, cards: [], mainValue: 20, length: 1 };
    expect(canBeat(bomb, single)).toBe(true);
    expect(canBeat(single, bomb)).toBe(false);
  });

  it('bigger bomb (more cards) beats smaller bomb regardless of rank', () => {
    const bomb4: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 20, length: 4 };
    const bomb5: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 3, length: 5 };
    const bomb6: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 3, length: 6 };
    expect(canBeat(bomb5, bomb4)).toBe(true);
    expect(canBeat(bomb6, bomb4)).toBe(true);
    expect(canBeat(bomb6, bomb5)).toBe(true);
    expect(canBeat(bomb4, bomb5)).toBe(false);
    expect(canBeat(bomb4, bomb6)).toBe(false);
  });

  it('bombs of equal card count compare by rank', () => {
    const bomb3: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 3, length: 4 };
    const bomb20: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 20, length: 4 };
    expect(canBeat(bomb20, bomb3)).toBe(true);
    expect(canBeat(bomb3, bomb20)).toBe(false);
    expect(canBeat(bomb3, bomb3)).toBe(false);
  });

  it('rocket beats everything; multi-pair rocket beats smaller rocket', () => {
    const rocket: HandPattern = { type: HandType.Rocket, cards: [], mainValue: 25, length: 1 };
    const rocket2: HandPattern = { type: HandType.Rocket, cards: [], mainValue: 25, length: 2 };
    const bomb: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 20, length: 8 };
    expect(canBeat(rocket, bomb)).toBe(true);
    expect(canBeat(rocket2, bomb)).toBe(true);
    expect(canBeat(rocket2, rocket)).toBe(true);
    expect(canBeat(rocket, rocket2)).toBe(false);
    expect(canBeat(rocket, rocket)).toBe(false);
    expect(canBeat(rocket2, rocket2)).toBe(false);
  });

  it('bomb never beats rocket (rocket > any bomb)', () => {
    const rocket: HandPattern = { type: HandType.Rocket, cards: [], mainValue: 25, length: 1 };
    const bomb: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 20, length: 4 };
    expect(canBeat(bomb, rocket)).toBe(false);
  });

  it('different type cannot beat (non-bomb)', () => {
    const pair: HandPattern = { type: HandType.Pair, cards: [], mainValue: 20, length: 1 };
    const single: HandPattern = { type: HandType.Single, cards: [], mainValue: 3, length: 1 };
    expect(canBeat(pair, single)).toBe(false);
  });

  it('straight length must match', () => {
    const straight5: HandPattern = { type: HandType.Straight, cards: [], mainValue: 3, length: 5 };
    const straight6: HandPattern = { type: HandType.Straight, cards: [], mainValue: 3, length: 6 };
    expect(canBeat(straight6, straight5)).toBe(false);
    expect(canBeat(straight5, straight5)).toBe(false);
    const straight7: HandPattern = { type: HandType.Straight, cards: [], mainValue: 5, length: 5 };
    expect(canBeat(straight7, straight5)).toBe(true);
  });
});

describe('findAllPlays', () => {
  it('finds singles from hand', () => {
    const hand = makeCards([3, 5, 7]);
    const plays = findAllPlays(hand);
    const singles = plays.filter(p => p.type === HandType.Single);
    expect(singles.length).toBe(3);
  });

  it('finds pair', () => {
    const hand = makeCards([5, 5, 7]);
    const plays = findAllPlays(hand);
    expect(plays.some(p => p.type === HandType.Pair)).toBe(true);
  });

  it('finds rocket from 虎 and 龍', () => {
    const cards = makeCards([25, 30]);
    cards[0]!.rankLabel = '虎';
    cards[1]!.rankLabel = '龍';
    const plays = findAllPlays(cards);
    expect(plays.some(p => p.type === HandType.Rocket)).toBe(true);
  });

  it('finds bomb from 5+ same cards', () => {
    const plays = findAllPlays(makeCards([7, 7, 7, 7, 7]));
    const bombs = plays.filter(p => p.type === HandType.Bomb);
    expect(bombs.length).toBe(1);
    expect(bombs[0]!.cards.length).toBe(5);
    expect(bombs[0]!.length).toBe(5);
  });

  it('finds multi-pair rockets from multiple jokers (deduplicated)', () => {
    const plays = findAllPlays(makeCards([25, 25, 30, 30]));
    const rockets = plays.filter(p => p.type === HandType.Rocket);
    // 1 对（1 虎 1 龍，组合去重后 1 个）+ 2 对（2 虎 2 龍）
    expect(rockets.length).toBe(2);
    expect(rockets.some(p => p.length === 1 && p.cards.length === 2)).toBe(true);
    expect(rockets.some(p => p.length === 2 && p.cards.length === 4)).toBe(true);
  });
});

describe('findBeatingPlays', () => {
  it('finds plays that beat last play', () => {
    const hand = makeCards([5, 7, 9, 11, 13]);
    const lastPlay: HandPattern = { type: HandType.Single, cards: makeCards([3]), mainValue: 3, length: 1 };
    const beating = findBeatingPlays(hand, lastPlay);
    expect(beating.every(p => p.type === HandType.Single)).toBe(true);
    expect(beating.every(p => p.mainValue > 3)).toBe(true);
  });
});

describe('A-2-3-4-5 special straight (A as 1)', () => {
  it('identifies A-2-3-4-5 as a straight with mainValue 1', () => {
    const result = identifyHand(makeCards([15, 20, 3, 4, 5]));
    expect(result?.type).toBe(HandType.Straight);
    expect(result?.length).toBe(5);
    expect(result?.mainValue).toBe(1);
  });

  it('is the weakest 5-card straight: 5-6-7-8-9 beats it, it beats no other straight', () => {
    const special = identifyHand(makeCards([15, 20, 3, 4, 5]))!;
    const straight56789 = identifyHand(makeCards([5, 6, 7, 8, 9]))!;
    const straight34567 = identifyHand(makeCards([3, 4, 5, 6, 7]))!;
    expect(canBeat(straight56789, special)).toBe(true);
    expect(canBeat(straight34567, special)).toBe(true);
    expect(canBeat(special, straight56789)).toBe(false);
    expect(canBeat(special, straight34567)).toBe(false);
  });

  it('findAllPlays finds A-2-3-4-5 from a hand containing A, 2, 3, 4, 5', () => {
    const hand = makeCards([15, 20, 3, 4, 5, 9]);
    const plays = findAllPlays(hand);
    const special = plays.filter(p => p.type === HandType.Straight && p.mainValue === 1);
    expect(special.length).toBe(1);
    expect(special[0]!.length).toBe(5);
    expect(special[0]!.cards.length).toBe(5);
  });

  it('findBeatingPlays can beat it with a normal straight, and it cannot beat a normal straight', () => {
    const special = identifyHand(makeCards([15, 20, 3, 4, 5]))!;
    const beaterHand = makeCards([5, 6, 7, 8, 9]);
    const beating = findBeatingPlays(beaterHand, special);
    expect(beating.some(p => p.type === HandType.Straight && p.mainValue === 5)).toBe(true);

    const normal = identifyHand(makeCards([3, 4, 5, 6, 7]))!;
    const specialHand = makeCards([15, 20, 3, 4, 5]);
    const specialBeating = findBeatingPlays(specialHand, normal);
    expect(specialBeating.some(p => p.type === HandType.Straight)).toBe(false);
  });

  it('does not identify 2-3-4-5-6 as a straight (2 cannot lead)', () => {
    expect(identifyHand(makeCards([20, 3, 4, 5, 6]))).toBeNull();
  });

  it('does not identify A-2-3-4 as a straight (too short)', () => {
    expect(identifyHand(makeCards([15, 20, 3, 4]))).toBeNull();
  });

  it('does not identify combinations with jokers as straights', () => {
    expect(identifyHand(makeCards([25, 3, 4, 5, 6]))).toBeNull();
    expect(identifyHand(makeCards([30, 15, 20, 3, 4]))).toBeNull();
    expect(identifyHand(makeCards([25, 30, 3, 4, 5]))).toBeNull();
  });
});

describe('createDeck', () => {
  it('creates 54 card deck', () => {
    resetCardIdCounter();
    const deck = createDeck();
    expect(deck.length).toBe(54);
  });

  it('includes 虎 and 龍', () => {
    resetCardIdCounter();
    const deck = createDeck();
    expect(deck.some(c => c.rank === 25 && c.suit === null)).toBe(true);
    expect(deck.some(c => c.rank === 30 && c.suit === null)).toBe(true);
  });
});