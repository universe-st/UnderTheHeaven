import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import { HandType } from '../../models/BattleTypes';
import { decidePlay, DEFAULT_WEIGHTS } from '../AIBrain';
import type { EnemyCharacterId } from '../../models/Character';

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

// ========== Helper functions for advanced tests ==========

function makeBattleWithEnemy(overrides: Partial<BattleState> = {}, enemyId?: EnemyCharacterId): BattleState {
  return {
    ...makeBattle(overrides),
    enemyCharacterId: enemyId,
  };
}

function makeCardSet(ranks: number[], suits?: Card['suit'][]): Card[] {
  return ranks.map((r, i) => makeCard(r, suits?.[i] ?? 'spade'));
}

// ========== Task 9: Default profile and backward compatibility ==========

describe('decidePlay - BotProfile weights', () => {
  it('default weights match existing scoring behavior for single card hand', () => {
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

  it('wait for pair over single from existing test pattern', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(7), makeCard(7, 'club'), makeCard(3)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });
});

// ========== Task 10: Per-enemy strategy verification ==========

describe('decidePlay - enemy strategies', () => {
  it('shizu picks smallest card when leading', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: makeCardSet([5, 8, 12]), deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'shizu');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(5);
  });

  it('banner_army prefers diamond single when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: {
        hand: [makeCard(5, 'diamond'), makeCard(8, 'spade')],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      phase: 'play',
    }, 'banner_army');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('diamond');
  });

  it('mongol_army prefers spade single when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: [makeCard(5, 'spade'), makeCard(8, 'diamond')], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'mongol_army');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('spade');
  });

  it('xiongnu_army prefers heart single when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: [makeCard(5, 'heart'), makeCard(8, 'spade')], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'xiongnu_army');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).toBe('heart');
  });

  it('qiangdao prefers single over pair when available', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: [makeCard(5, 'club'), makeCard(5, 'spade'), makeCard(8, 'diamond')], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'qiangdao');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
  });

  it('huangjinjun prefers smallest card when leading', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: makeCardSet([3, 7, 10]), deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'huangjinjun');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(3);
  });

  it('nanmanjun avoids heart cards', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: [makeCard(5, 'heart'), makeCard(7, 'spade')], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'nanmanjun');
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result![0]!.suit).not.toBe('heart');
  });
});

// ========== Task 11: Respond mode tests ==========

describe('decidePlay - respond mode', () => {
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

  it('prefers same-type beating card over bomb in respond mode', () => {
    resetCardIdCounter();
    const state = makeBattle({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: {
        hand: [
          makeCard(12), makeCard(12, 'club'), makeCard(12, 'diamond'), makeCard(12, 'heart'),
          makeCard(7), makeCard(9),
        ],
        deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人',
      },
      lastPlay: { type: HandType.Single, cards: [makeCard(5)], mainValue: 5, length: 1 },
      phase: 'respond',
    });
    const result = decidePlay(state);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0]!.rank).toBeLessThan(12);
  });
});

// ========== Task 12: onAIDecision callback integration ==========

describe('decidePlay - onAIDecision callback integration', () => {
  it('adjustPlayScores callback modifies decision', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(5), makeCard(10)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });

    const result = decidePlay(state, (plays) => {
      for (const p of plays) {
        const avgRank = p.play.cards.reduce((s, c) => s + c.rank, 0) / p.play.cards.length;
        if (avgRank > 7) p.score -= 100;
      }
    });
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(5);
  });

  it('passing no callback preserves original behavior', () => {
    resetCardIdCounter();
    const state = makeBattle({
      enemy: { hand: [makeCard(5), makeCard(10)], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    });
    const result1 = decidePlay(state);
    const result2 = decidePlay(state);
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
  });
});
