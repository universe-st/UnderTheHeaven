import { describe, it, expect } from 'vitest';
import type { Card } from '../Card';
import { sortPlayedCards, cardDisplayName, getNextCardId, resetCardIdCounter } from '../Card';

function makeCard(rank: number, suit: Card['suit'] = 'spade', rankLabel?: string): Card {
  return { uid: getNextCardId(), suit, rank, rankLabel: rankLabel ?? String(rank) };
}

describe('cardDisplayName', () => {
  it('shows suit symbol + rank for regular cards', () => {
    const card = makeCard(3, 'spade');
    expect(cardDisplayName(card)).toBe('♠3');
  });

  it('shows rankLabel for jokers', () => {
    const tiger = makeCard(25, null, '虎');
    expect(cardDisplayName(tiger)).toBe('虎');

    const dragon = makeCard(30, null, '龍');
    expect(cardDisplayName(dragon)).toBe('龍');
  });

  it('shows heart suit', () => {
    const card = makeCard(10, 'heart');
    expect(cardDisplayName(card)).toBe('♥10');
  });
});

describe('sortPlayedCards', () => {
  it('sorts by multiplicity then rank', () => {
    resetCardIdCounter();
    const cards = [
      makeCard(5, 'spade'),
      makeCard(5, 'club'),
      makeCard(3, 'heart'),
    ];
    const sorted = sortPlayedCards(cards);
    expect(sorted[0]!.rank).toBe(5);
    expect(sorted[1]!.rank).toBe(5);
    expect(sorted[2]!.rank).toBe(3);
  });

  it('places consideredAs cards after regular cards of same rank', () => {
    resetCardIdCounter();
    const regular = makeCard(5, 'spade');
    const considered = makeCard(5, 'club');
    considered.consideredAs = { rank: 7, rankLabel: '7', suit: '♠' };
    const sorted = sortPlayedCards([regular, considered]);
    expect(sorted[0]!.uid).toBe(regular.uid);
    expect(sorted[1]!.uid).toBe(considered.uid);
  });

  it('sorts by suit within same rank', () => {
    resetCardIdCounter();
    const club = makeCard(5, 'club');
    const spade = makeCard(5, 'spade');
    const sorted = sortPlayedCards([club, spade]);
    expect(sorted[0]!.suit).toBe('spade');
    expect(sorted[1]!.suit).toBe('club');
  });
});
