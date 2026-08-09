import { describe, it, expect, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { rankToLabel, resetCardIdCounter, SUITS, CARD_RANKS } from '../../models/Card';
import { pickLargestCardIndex, rollTempCard, isJoker } from '../ZhaoGaoZhiLuLogic';

let idc = 0;
function card(rank: number, suit: Card['suit'] = 'spade'): Card {
  idc += 1;
  return { uid: `c${idc}`, suit, rank, rankLabel: rankToLabel(rank) };
}

function joker(rank: 25 | 30): Card {
  idc += 1;
  return { uid: `c${idc}`, suit: null, rank, rankLabel: rankToLabel(rank) };
}

const R = {
  THREE: 3, FIVE: 5, TEN: 10, K: 13, A: 15, TWO: 20, HU: 25, LONG: 30,
} as const;

describe('ZhaoGaoZhiLu pickLargestCardIndex (随机失去一张最大的牌)', () => {
  it('选中唯一的最大牌', () => {
    const hand = [card(R.THREE), card(R.K), card(R.FIVE)];
    expect(pickLargestCardIndex(hand, () => 0)).toBe(1);
  });

  it('多点并列最大时随机取一（rng 决定）', () => {
    const hand = [card(R.K), card(R.THREE), card(R.K)];
    // rng()=0 → 第一个并列最大（下标 0）；rng()=0.99 → 第二个并列最大（下标 2）
    expect(pickLargestCardIndex(hand, () => 0)).toBe(0);
    expect(pickLargestCardIndex(hand, () => 0.99)).toBe(2);
  });

  it('王大于 2：手牌含王时失去的是王', () => {
    const hand = [card(R.TWO), joker(R.HU)];
    expect(pickLargestCardIndex(hand, () => 0)).toBe(1);
  });

  it('龍(30) 大于 虎(25)：两张王都在手时失去龍', () => {
    const hand = [joker(R.HU), joker(R.LONG)];
    expect(pickLargestCardIndex(hand, () => 0)).toBe(1);
  });

  it('consideredAs 视为点数参与比较（筹策改造过的临时牌）', () => {
    const big = { ...card(R.FIVE), consideredAs: { rank: R.K, rankLabel: 'K', suit: 'spade' } };
    const hand = [card(R.TEN), big];
    expect(pickLargestCardIndex(hand, () => 0)).toBe(1);
  });
});

describe('ZhaoGaoZhiLu rollTempCard (生成点数不大于失去牌的临时牌)', () => {
  beforeEach(() => {
    resetCardIdCounter();
  });

  it('失去 2(20) 时点数不大于 20（全部普通点数可选）', () => {
    const possible = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const t = rollTempCard(card(R.TWO), Math.random)!;
      possible.add(t.rank);
      expect(t.rank).toBeLessThanOrEqual(R.TWO);
      expect(t.rank).toBeGreaterThanOrEqual(R.THREE);
    }
    expect(possible.size).toBe(CARD_RANKS.length);
  });

  it('失去 K(13) 时点数不大于 13，且不会出现 15(A)/20(2)', () => {
    const possible = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const t = rollTempCard(card(R.K), Math.random)!;
      possible.add(t.rank);
      expect(t.rank).toBeLessThanOrEqual(R.K);
      expect(t.rank).toBeGreaterThanOrEqual(R.THREE);
    }
    expect(possible).toEqual(expect.not.arrayContaining([R.A, R.TWO]));
  });

  it('失去 3(3) 时只能生成点数 3', () => {
    for (let i = 0; i < 20; i++) {
      expect(rollTempCard(card(R.THREE), () => 0.5)!.rank).toBe(R.THREE);
    }
  });

  it('失去大小王时点数最大为 2（2 为最大点数）', () => {
    for (const j of [joker(R.HU), joker(R.LONG)]) {
      const possible = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const t = rollTempCard(j, Math.random)!;
        possible.add(t.rank);
        expect(t.rank).toBeLessThanOrEqual(R.TWO);
        expect(t.rank).toBeGreaterThanOrEqual(R.THREE);
      }
      expect(possible.size).toBe(CARD_RANKS.length); // 失去王时可生成任意普通点数
    }
  });

  it('生成的牌是随机花色的临时牌（isTemp），rankLabel 合法', () => {
    const suits = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = rollTempCard(card(R.K), Math.random)!;
      expect(t.isTemp).toBe(true);
      expect(t.suit).not.toBeNull();
      suits.add(t.suit!);
      expect(t.rankLabel).not.toBe('?');
      expect(t.rankLabel).toBe(rankToLabel(t.rank));
    }
    expect(suits.size).toBe(SUITS.length);
  });

  it('isJoker 判定：suit 为 null 即王', () => {
    expect(isJoker(joker(R.HU))).toBe(true);
    expect(isJoker(joker(R.LONG))).toBe(true);
    expect(isJoker(card(R.TWO))).toBe(false);
  });
});
