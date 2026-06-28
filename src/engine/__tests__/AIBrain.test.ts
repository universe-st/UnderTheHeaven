import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { BattleState, HandPattern } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { decidePlay } from '../AIBrain';

function makeCard(rank: number, suit: Card['suit'] = 'spade', uid?: string): Card {
  return { uid: uid ?? getNextCardId(), suit, rank, rankLabel: String(rank) };
}

function makeBattle(overrides: Partial<BattleState> = {}): BattleState {
  return {
    player: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: 500,
      vitalityMax: 500,
      name: '玩家',
    },
    enemy: {
      hand: [],
      deck: [],
      discardPile: [],
      vitality: 500,
      vitalityMax: 500,
      name: '敌人',
    },
    turnHolder: 'player',
    lastPlay: null,
    phase: 'play',
    turnCount: 1,
    ...overrides,
  };
}

describe('decidePlay - 主动出牌 (phase=play)', () => {
  it('returns null from empty hand', () => {
    resetCardIdCounter();
    const state = makeBattle();
    const result = decidePlay(state);
    expect(result).toBeNull();
  });

  it('returns a single card when only one play exists', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(5)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.rank).toBe(5);
  });

  it('returns a pair when hand has matching ranks', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(7), makeCard(7, 'club')], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('decidePlay - 接牌 (phase=respond)', () => {
  it('returns null when no card can beat last play', () => {
    resetCardIdCounter();
    const state = makeBattle({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: { hand: [makeCard(3)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      lastPlay: { type: HandType.Single, cards: [makeCard(10)], mainValue: 10, length: 1 },
      phase: 'respond',
    });
    const result = decidePlay(state);
    expect(result).toBeNull();
  });

  it('returns beating card when possible', () => {
    resetCardIdCounter();
    const state = makeBattle({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: { hand: [makeCard(7), makeCard(10)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      lastPlay: { type: HandType.Single, cards: [makeCard(5)], mainValue: 5, length: 1 },
      phase: 'respond',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBeGreaterThan(5);
  });
});
