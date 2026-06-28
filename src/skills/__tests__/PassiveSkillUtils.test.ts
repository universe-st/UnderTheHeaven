import { describe, it, expect, beforeEach } from 'vitest';
import { registerResponseBlock, getBlockedResponseTypes, clearPassiveSkills } from '../PassiveSkillUtils';
import type { HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';

function makePattern(type: HandType, mainValue: number = 3): HandPattern {
  return { type, cards: [], mainValue, length: 1 };
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
