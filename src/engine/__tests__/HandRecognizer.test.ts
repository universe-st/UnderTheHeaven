import { describe, it, expect } from 'vitest';
import type { Card} from '../../models/Card';
import { createDeck, getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { HandPattern} from '../../models/BattleTypes';
import { HandType, HAND_TYPE_LABELS } from '../../models/BattleTypes';
import { identifyHand, findAllPlays, canBeat, findBeatingPlays, rankForOrder } from '../HandRecognizer';

function makeCard(rank: number, suit: Card['suit'] = 'spade'): Card {
  return { uid: getNextCardId(), suit, rank, rankLabel: rank <= 13 ? String(rank) : rank < 25 ? ['A', '2'][rank - 15]! : rank === 25 ? '虎' : '龍' };
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
  });

  it('identifies rocket', () => {
    const cards = makeCards([25, 30]);
    cards[0]!.rankLabel = '虎';
    cards[1]!.rankLabel = '龍';
    const result = identifyHand(cards);
    expect(result?.type).toBe(HandType.Rocket);
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
    const bomb: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 3, length: 1 };
    const single: HandPattern = { type: HandType.Single, cards: [], mainValue: 20, length: 1 };
    expect(canBeat(bomb, single)).toBe(true);
    expect(canBeat(single, bomb)).toBe(false);
  });

  it('rocket beats everything except rocket', () => {
    const rocket: HandPattern = { type: HandType.Rocket, cards: [], mainValue: 25, length: 2 };
    const bomb: HandPattern = { type: HandType.Bomb, cards: [], mainValue: 20, length: 1 };
    const rocket2: HandPattern = { type: HandType.Rocket, cards: [], mainValue: 25, length: 2 };
    expect(canBeat(rocket, bomb)).toBe(true);
    expect(canBeat(rocket, rocket2)).toBe(false);
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