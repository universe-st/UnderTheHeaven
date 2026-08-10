import { describe, it, expect, beforeEach } from 'vitest';
import { registerResponseBlock, getBlockedResponseTypes, clearPassiveSkills } from '../PassiveSkillUtils';
import type { HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { LiBaiShiXianBlock, BLOCKED_ALL_BUT_ROCKET } from '../LiBaiShiXian';

function makePattern(type: HandType, mainValue: number = 3): HandPattern {
  return { type, cards: [], mainValue, length: 1 };
}

function makeCardsPattern(type: HandType, cardCount: number, mainValue: number = 3): HandPattern {
  return {
    type,
    cards: Array.from({ length: cardCount }, (_, i) => ({ uid: `t${i}`, suit: 'spade' as const, rank: 3, rankLabel: '3', score: 3 })),
    mainValue,
    length: cardCount,
  };
}

describe('getBlockedResponseTypes', () => {
  beforeEach(() => {
    clearPassiveSkills();
  });

  it('returns empty array when no enemy character id', () => {
    expect(getBlockedResponseTypes(undefined, makePattern(HandType.Single))).toEqual([]);
  });

  it('returns empty array when no last play', () => {
    expect(getBlockedResponseTypes('banner_army', null)).toEqual([]);
  });

  it('returns empty array when no modifiers registered', () => {
    expect(getBlockedResponseTypes('banner_army', makePattern(HandType.Single))).toEqual([]);
  });

  it('returns blocked types from registered modifiers', () => {
    registerResponseBlock('banner_army', {
      type: 'response_block',
      getBlockedTypes: ({ lastPlay }) => {
        if (lastPlay.type === HandType.Single) return [HandType.Single];
        return [];
      },
    });

    const blocked = getBlockedResponseTypes('banner_army', makePattern(HandType.Single));
    expect(blocked).toEqual([HandType.Single]);
  });

  it('aggregates blocked types from multiple modifiers', () => {
    registerResponseBlock('banner_army', {
      type: 'response_block',
      getBlockedTypes: () => [HandType.Single],
    });
    registerResponseBlock('banner_army', {
      type: 'response_block',
      getBlockedTypes: () => [HandType.Pair],
    });

    const blocked = getBlockedResponseTypes('banner_army', makePattern(HandType.Single));
    expect(blocked).toEqual([HandType.Single, HandType.Pair]);
  });

  it('ignores modifiers for other characters', () => {
    registerResponseBlock('banner_army', {
      type: 'response_block',
      getBlockedTypes: () => [HandType.Single],
    });

    const blocked = getBlockedResponseTypes('other_char', makePattern(HandType.Single));
    expect(blocked).toEqual([]);
  });
});

describe('李白「诗仙」响应封锁（5/7 张只能被王炸响应）', () => {
  beforeEach(() => {
    clearPassiveSkills();
    registerResponseBlock('libai', LiBaiShiXianBlock);
  });

  it('5 张牌时封锁除王炸外的全部牌型', () => {
    const blocked = getBlockedResponseTypes('libai', makeCardsPattern(HandType.Straight, 5));
    expect(blocked).toEqual(BLOCKED_ALL_BUT_ROCKET);
    expect(blocked).not.toContain(HandType.Rocket);
    expect(blocked).toContain(HandType.Bomb);
  });

  it('7 张牌时封锁除王炸外的全部牌型', () => {
    const blocked = getBlockedResponseTypes('libai', makeCardsPattern(HandType.AirplaneSingle, 7));
    expect(blocked).toEqual(BLOCKED_ALL_BUT_ROCKET);
  });

  it('4 张或 6 张牌时不封锁', () => {
    expect(getBlockedResponseTypes('libai', makeCardsPattern(HandType.Bomb, 4))).toEqual([]);
    expect(getBlockedResponseTypes('libai', makeCardsPattern(HandType.Straight, 6))).toEqual([]);
  });

  it('其他角色查询李白封锁不生效', () => {
    expect(getBlockedResponseTypes('banner_army', makeCardsPattern(HandType.Straight, 5))).toEqual([]);
  });
});
