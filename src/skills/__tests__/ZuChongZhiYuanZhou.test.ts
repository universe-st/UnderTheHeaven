import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { ZuChongZhiYuanZhou } from '../ZuChongZhiYuanZhou';

let idc = 0;
function card(rank: number): Card {
  idc += 1;
  return { uid: `c${idc}`, suit: 'spade', rank, rankLabel: String(rank) };
}

const R = { THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, J: 11, Q: 12, K: 13, A: 15, TWO: 20 };

describe('ZuChongZhiYuanZhou cardFilter (圆周)', () => {
  it('accepts 3 alone (pi starts with 3)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.THREE)])).toBe(true);
  });

  it('accepts A + 3 (pi prefix 3,1)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.A), card(R.THREE)])).toBe(true);
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.THREE), card(R.A)])).toBe(true);
  });

  it('accepts the full description example 3 1 4 1 5 9 2 6', () => {
    const sel = [card(R.THREE), card(R.A), card(R.FOUR), card(R.A), card(R.FIVE), card(R.NINE), card(R.TWO), card(R.SIX)];
    expect(ZuChongZhiYuanZhou.cardFilter!(sel)).toBe(true);
  });

  it('accepts 3,1,4 (prefix of length 3)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.THREE), card(R.A), card(R.FOUR)])).toBe(true);
  });

  it('accepts 5,9,A,1,4,3,2,6 (shuffled 3,1,4,1,5,9,2,6) — order independent', () => {
    const sel = [card(R.FIVE), card(R.NINE), card(R.A), card(R.A), card(R.FOUR), card(R.THREE), card(R.TWO), card(R.SIX)];
    expect(ZuChongZhiYuanZhou.cardFilter!(sel)).toBe(true);
  });

  it('accepts 3,1,4,1,5,9,2,6,5 (9 cards, duplicate 3/1/5 handled by multiset)', () => {
    const sel = [card(R.THREE), card(R.A), card(R.FOUR), card(R.A), card(R.FIVE), card(R.NINE), card(R.TWO), card(R.SIX), card(R.FIVE)];
    expect(ZuChongZhiYuanZhou.cardFilter!(sel)).toBe(true);
  });

  it('rejects A alone (pi starts with 3, not 1)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.A)])).toBe(false);
  });

  it('rejects 3,4 (prefix 3,1 needs an A, not a 4)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.THREE), card(R.FOUR)])).toBe(false);
  });

  it('rejects 2,3,A (prefix 3,1,4 needs a 4, not a 2)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.TWO), card(R.THREE), card(R.A)])).toBe(false);
  });

  it('rejects J/Q/K/jokers (not representable as pi digits)', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.J)])).toBe(false);
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.Q)])).toBe(false);
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.K)])).toBe(false);
    expect(ZuChongZhiYuanZhou.cardFilter!([card(R.THREE), card(R.J)])).toBe(false);
  });

  it('rejects empty selection', () => {
    expect(ZuChongZhiYuanZhou.cardFilter!([])).toBe(false);
  });

  it('10 maps to digit 0 — accepts 3,1,4,...,5,0 (32-digit prefix ending before first 0 is NOT touched; 0 appears at pi position 33)', () => {
    const piRanks = [
      R.THREE, R.A, R.FOUR, R.A, R.FIVE, R.NINE, R.TWO, R.SIX,
      R.FIVE, R.THREE, R.FIVE, R.EIGHT, R.NINE, R.SEVEN, R.NINE, R.THREE,
      R.TWO, R.THREE, R.EIGHT, R.FOUR, R.SIX, R.TWO, R.SIX, R.FOUR,
      R.THREE, R.THREE, R.EIGHT, R.THREE, R.TWO, R.SEVEN, R.NINE, R.FIVE,
      R.TEN,
    ];
    expect(ZuChongZhiYuanZhou.cardFilter!(piRanks.map(card))).toBe(true);
  });
});
