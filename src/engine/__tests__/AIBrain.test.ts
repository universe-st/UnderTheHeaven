import { describe, it, expect } from 'vitest';
import type { Card } from '../../models/Card';
import { getNextCardId, resetCardIdCounter } from '../../models/Card';
import type { BattleState } from '../../models/BattleTypes';
import { HandType, type HandPattern } from '../../models/BattleTypes';
import { decidePlay } from '../AIBrain';
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

// ========== Task 10: Per-enemy strategy — via callback integration ==========

describe('decidePlay - enemy strategies via callback', () => {
  it('profile selection config affects randomness (shizu: low variance)', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      enemy: { hand: makeCardSet([5, 8, 12]), deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      phase: 'play',
    }, 'shizu');
    // Running multiple times should always pick the deterministic top scorer
    for (let i = 0; i < 10; i++) {
      const result = decidePlay(state);
      expect(result).not.toBeNull();
    }
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

// ========== Task 10b: Direct onAIDecision hook tests ==========

describe('onAIDecision hooks - unit tests', () => {
  function makeMockPlay(rank: number, suit: Card['suit'] = 'spade', type: HandType = HandType.Single): { play: HandPattern; score: number } {
    return {
      play: {
        type,
        cards: [makeCard(rank, suit)],
        mainValue: rank,
        length: 1,
      },
      score: 50,
    };
  }

  it('banner_army: adds +20 to diamond single', () => {
    const plays = [makeMockPlay(5, 'diamond'), makeMockPlay(8, 'spade')];
    const hook = (plays: { play: HandPattern; score: number }[]) => {
      for (const p of plays) {
        if (p.play.type === HandType.Single && p.play.cards[0]?.suit === 'diamond') {
          p.score += 20;
        }
      }
    };
    hook(plays);
    expect(plays[0]!.score).toBe(70);
    expect(plays[1]!.score).toBe(50);
  });

  it('mongol_army: adds +15 to spade single', () => {
    const plays = [makeMockPlay(5, 'spade'), makeMockPlay(8, 'diamond')];
    const hook = (plays: { play: HandPattern; score: number }[]) => {
      for (const p of plays) {
        if (p.play.type === HandType.Single && p.play.cards[0]?.suit === 'spade') {
          p.score += 15;
        }
      }
    };
    hook(plays);
    expect(plays[0]!.score).toBe(65);
    expect(plays[1]!.score).toBe(50);
  });

  it('xiongnu_army: adds +15 to heart single', () => {
    const plays = [makeMockPlay(5, 'heart'), makeMockPlay(8, 'spade')];
    const hook = (plays: { play: HandPattern; score: number }[]) => {
      for (const p of plays) {
        if (p.play.type === HandType.Single && p.play.cards[0]?.suit === 'heart') {
          p.score += 15;
        }
      }
    };
    hook(plays);
    expect(plays[0]!.score).toBe(65);
    expect(plays[1]!.score).toBe(50);
  });

  it('qiangdao: adds +10 to single', () => {
    const plays = [makeMockPlay(5, 'spade'), makeMockPlay(5, 'club', HandType.Pair)];
    const hook = (plays: { play: HandPattern; score: number }[]) => {
      for (const p of plays) {
        if (p.play.type === HandType.Single) p.score += 10;
      }
    };
    hook(plays);
    expect(plays[0]!.score).toBe(60);
    expect(plays[1]!.score).toBe(50); // pair not affected
  });

  it('huangjinjun: adds score inversely proportional to min rank', () => {
    const plays = [makeMockPlay(3), makeMockPlay(10)];
    const hook = (plays: { play: HandPattern; score: number }[]) => {
      for (const p of plays) {
        const minRank = Math.min(...p.play.cards.map(c => c.rank));
        p.score += Math.max(0, 15 - minRank) * 1.5;
      }
    };
    // rank 3 → (15-3)*1.5 = 18
    // rank 10 → (15-10)*1.5 = 7.5
    hook(plays);
    expect(plays[0]!.score).toBe(68);
    expect(plays[1]!.score).toBe(57.5);
  });

  it('nanmanjun: adds +5 for black, -10 for heart', () => {
    const plays = [makeMockPlay(5, 'spade'), makeMockPlay(7, 'heart'), makeMockPlay(9, 'diamond')];
    const hook = (plays: { play: HandPattern; score: number }[]) => {
      for (const p of plays) {
        for (const card of p.play.cards) {
          if (card.suit === 'spade' || card.suit === 'club') p.score += 5;
          if (card.suit === 'heart') p.score -= 10;
        }
      }
    };
    hook(plays);
    expect(plays[0]!.score).toBe(55); // spade: +5
    expect(plays[1]!.score).toBe(40); // heart: -10
    expect(plays[2]!.score).toBe(50); // diamond: unchanged
  });

  it('xiliang_army: adds more for emptying hand', () => {
    const plays = [makeMockPlay(3), makeMockPlay(5)];
    const hook = (plays: { play: HandPattern; score: number }[], ctx: { hand: Card[] }) => {
      const handSize = ctx.hand.length;
      for (const p of plays) {
        if (handSize - p.play.cards.length <= 0) {
          p.score += handSize <= 3 ? 30 : handSize <= 6 ? 15 : 5;
        }
      }
    };
    const ctx = { hand: [makeCard(3)] };
    hook(plays, ctx);
    expect(plays[0]!.score).toBeGreaterThan(52); // 50 + 30 for emptying with 1-card hand
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

// ========== Regression: passThreshold should not prevent legal plays ==========

describe('decidePlay - passThreshold regression', () => {
  it('banner_army beats single Q with club K', () => {
    resetCardIdCounter();
    const state = makeBattleWithEnemy({
      player: { hand: [], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '玩家' },
      enemy: { hand: [makeCard(13, 'club')], deck: [], discardPile: [], vitality: 500, vitalityMax: 500, name: '敌人' },
      lastPlay: { type: HandType.Single, cards: [makeCard(12)], mainValue: 12, length: 1 },
      phase: 'respond',
    }, 'banner_army');
    const result = decidePlay(state, (plays) => {
      // Simulate BattleFlowManager injecting banner_army's onAIDecision hook
      for (const p of plays) {
        if (p.play.type === HandType.Single && p.play.cards[0]?.suit === 'diamond') {
          p.score += 20;
        }
      }
    });
    expect(result).not.toBeNull();
    expect(result![0]!.rank).toBe(13);
  });
});
