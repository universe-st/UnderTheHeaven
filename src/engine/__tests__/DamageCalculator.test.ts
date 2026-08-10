import { describe, it, expect } from 'vitest';
import type { Card} from '../../models/Card';
import { getNextCardId } from '../../models/Card';
import type { HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { calculateDamage, calculateDamageWithEmptyHand, getCoefficient } from '../DamageCalculator';

function makeCard(rank: number, suit: Card['suit'] = 'spade'): Card {
  return { uid: getNextCardId(), suit, rank, rankLabel: String(rank), score: rank };
}

describe('getCoefficient', () => {
  it('returns 1 for Single', () => expect(getCoefficient(HandType.Single, 1)).toBe(1));
  it('returns 1.2 for Pair', () => expect(getCoefficient(HandType.Pair, 1)).toBe(1.2));
  it('returns 1.5 for Triple', () => expect(getCoefficient(HandType.Triple, 1)).toBe(1.5));
  it('returns 2 for TriplePair', () => expect(getCoefficient(HandType.TriplePair, 1)).toBe(2));
  it('returns 3 for Bomb', () => expect(getCoefficient(HandType.Bomb, 1)).toBe(3));
  it('returns 4 for Rocket', () => expect(getCoefficient(HandType.Rocket, 2)).toBe(4));
  it('returns scaled value for Straight', () => {
    expect(getCoefficient(HandType.Straight, 5)).toBe(2);
    expect(getCoefficient(HandType.Straight, 6)).toBe(2.5);
    expect(getCoefficient(HandType.Straight, 8)).toBe(3.5);
  });
});

describe('calculateDamage', () => {
  it('calculates single card damage', () => {
    const pattern: HandPattern = {
      type: HandType.Single,
      cards: [makeCard(7)],
      mainValue: 7,
      length: 1,
    };
    expect(calculateDamage(pattern)).toBe(7);
  });

  it('calculates pair damage', () => {
    const pattern: HandPattern = {
      type: HandType.Pair,
      cards: [makeCard(5), makeCard(5, 'club')],
      mainValue: 5,
      length: 1,
    };
    expect(calculateDamage(pattern)).toBe(Math.round((5 + 5) * 1.2));
  });

  it('calculates bomb damage', () => {
    const cards = [makeCard(10), makeCard(10, 'club'), makeCard(10, 'heart'), makeCard(10, 'diamond')];
    const pattern: HandPattern = {
      type: HandType.Bomb,
      cards,
      mainValue: 10,
      length: 1,
    };
    expect(calculateDamage(pattern)).toBe(10 * 4 * 3);
  });

  it('calculates rocket damage', () => {
    const cards = [
      { uid: getNextCardId(), suit: null, rank: 25, rankLabel: '虎', score: 25 },
      { uid: getNextCardId(), suit: null, rank: 30, rankLabel: '龍', score: 30 },
    ];
    const pattern: HandPattern = {
      type: HandType.Rocket,
      cards,
      mainValue: 25,
      length: 2,
    };
    expect(calculateDamage(pattern)).toBe(Math.round((25 + 30) * 4));
  });

  it('牌面分数独立于点数：score≠rank 时伤害按 score 计算', () => {
    const card = makeCard(7);
    card.score = 12;
    const pattern: HandPattern = {
      type: HandType.Single,
      cards: [card],
      mainValue: 7,
      length: 1,
    };
    // 点数仍为 7，但伤害得分基准用 score=12
    expect(calculateDamage(pattern)).toBe(12);
  });

  it('score 缺失时兜底用 rank（旧数据兼容）', () => {
    const legacy = { uid: getNextCardId(), suit: 'spade', rank: 7, rankLabel: '7' } as Card;
    const pattern: HandPattern = {
      type: HandType.Single,
      cards: [legacy],
      mainValue: 7,
      length: 1,
    };
    expect(calculateDamage(pattern)).toBe(7);
  });
});

describe('calculateDamageWithEmptyHand', () => {
  it('multiplies base damage by 5', () => {
    const pattern: HandPattern = {
      type: HandType.Single,
      cards: [makeCard(5)],
      mainValue: 5,
      length: 1,
    };
    expect(calculateDamageWithEmptyHand(pattern)).toBe(5 * 5);
  });
});