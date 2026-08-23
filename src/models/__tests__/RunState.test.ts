import { describe, it, expect } from 'vitest';
import type { MapNode } from '../RunState';
import {
  createNewRun,
  calcDestinyLoss,
  tongbaoReward,
  interestOn,
  applyVictory,
  applyDefeat,
  isRunOver,
  isRunComplete,
  enemyVitalityFor,
  PLAYER_VITALITY,
  INITIAL_DESTINY,
  INITIAL_TONGBAO,
} from '../RunState';
import { createRng } from '../../engine/MapGenerator';

function makeNode(overrides: Partial<MapNode> = {}): MapNode {
  return { id: 'f1n0', floor: 1, index: 0, type: 'normal', enemyId: 'shizu', cleared: false, ...overrides };
}

describe('createNewRun', () => {
  it('initializes destiny/tongbao/floor/roster and a 36-layer map', () => {
    const run = createNewRun(createRng(1));
    expect(run.destiny).toBe(INITIAL_DESTINY);
    expect(run.destinyMax).toBe(INITIAL_DESTINY);
    expect(run.tongbao).toBe(INITIAL_TONGBAO);
    expect(run.floor).toBe(1);
    expect(run.roster).toHaveLength(1);
    expect(run.buciCards).toHaveLength(0);
    expect(run.layers).toHaveLength(36);
    expect(run.bossKills).toBe(0);
    expect(run.battlesWon).toBe(0);
    expect(run.permanentSuitBans).toEqual([]);
  });

  it('is reproducible for the same seed', () => {
    expect(createNewRun(createRng(9))).toEqual(createNewRun(createRng(9)));
  });
});

describe('calcDestinyLoss', () => {
  it('computes ceil(percent / 4)', () => {
    expect(calcDestinyLoss(80, false)).toBe(20);
    expect(calcDestinyLoss(1, false)).toBe(1);
    expect(calcDestinyLoss(0, false)).toBe(0);
  });

  it('doubles for bosses', () => {
    expect(calcDestinyLoss(80, true)).toBe(40);
    expect(calcDestinyLoss(1, true)).toBe(2);
    expect(calcDestinyLoss(0, true)).toBe(0);
  });
});

describe('tongbaoReward', () => {
  it('stays within range across 100 rolls', () => {
    const ranges = {
      normal: [8, 15],
      elite: [20, 30],
      boss: [40, 60],
    } as const;
    const rng = createRng(5);
    for (let i = 0; i < 100; i++) {
      for (const [type, [min, max]] of Object.entries(ranges)) {
        const v = tongbaoReward(type as keyof typeof ranges, rng);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
    }
  });

  it('returns 0 for shop and event', () => {
    const rng = createRng(5);
    expect(tongbaoReward('shop', rng)).toBe(0);
    expect(tongbaoReward('event', rng)).toBe(0);
  });

  it('hits both endpoints eventually', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(tongbaoReward('normal', rng));
    }
    expect(seen.has(8)).toBe(true);
    expect(seen.has(15)).toBe(true);
  });
});

describe('interestOn', () => {
  it('awards 10 interest per full 100 tongbao', () => {
    expect(interestOn(0)).toBe(0);
    expect(interestOn(99)).toBe(0);
    expect(interestOn(100)).toBe(10);
    expect(interestOn(150)).toBe(10);
    expect(interestOn(199)).toBe(10);
    expect(interestOn(200)).toBe(20);
    expect(interestOn(250)).toBe(20);
    expect(interestOn(1000)).toBe(100);
  });
});

describe('applyVictory', () => {
  it('clears the node, advances floor, adds tongbao + interest and counts battles', () => {
    const run = createNewRun(createRng(1));
    run.tongbao = 100;
    const node = run.layers[0]!.find((n) => n.type === 'normal') ?? makeNode({ floor: 1, type: 'normal' });
    const settlement = applyVictory(run, node, createRng(2));
    expect(node.cleared).toBe(true);
    expect(run.floor).toBe(2);
    // 奖励 8-15，100 + 奖励 仍处 100-199 档，利息恒为 10
    expect(settlement.reward).toBeGreaterThanOrEqual(8);
    expect(settlement.reward).toBeLessThanOrEqual(15);
    expect(settlement.interest).toBe(10);
    expect(run.tongbao).toBe(100 + settlement.reward + 10);
    expect(run.battlesWon).toBe(1);
    expect(run.bossKills).toBe(0);
  });

  it('counts boss kills', () => {
    const run = createNewRun(createRng(1));
    run.floor = 9;
    const boss = run.layers[8]![0]!;
    expect(boss.type).toBe('boss');
    applyVictory(run, boss, createRng(3));
    expect(run.bossKills).toBe(1);
    expect(run.battlesWon).toBe(1);
    expect(run.floor).toBe(10);
  });

  it('does not advance floor when clearing a non-current floor node', () => {
    const run = createNewRun(createRng(1));
    run.floor = 5;
    const node = makeNode({ floor: 2, type: 'normal' });
    applyVictory(run, node, createRng(4));
    expect(run.floor).toBe(5);
  });
});

describe('applyDefeat', () => {
  it('deducts destiny by remaining enemy vitality percent', () => {
    const run = createNewRun(createRng(1));
    applyDefeat(run, 80, false);
    expect(run.destiny).toBe(80);
  });

  it('floors destiny at 0', () => {
    const run = createNewRun(createRng(1));
    applyDefeat(run, 100, true);
    expect(run.destiny).toBe(50);
    applyDefeat(run, 100, true);
    expect(run.destiny).toBe(0);
    applyDefeat(run, 100, true);
    expect(run.destiny).toBe(0);
  });

  it('does not change floor', () => {
    const run = createNewRun(createRng(1));
    applyDefeat(run, 40, false);
    expect(run.floor).toBe(1);
  });
});

describe('isRunOver / isRunComplete', () => {
  it('isRunOver when destiny reaches 0', () => {
    const run = createNewRun(createRng(1));
    expect(isRunOver(run)).toBe(false);
    run.destiny = 0;
    expect(isRunOver(run)).toBe(true);
  });

  it('isRunComplete when floor-36 boss is cleared', () => {
    const run = createNewRun(createRng(1));
    expect(isRunComplete(run)).toBe(false);
    run.layers[35]![0]!.cleared = true;
    expect(isRunComplete(run)).toBe(true);
  });
});

describe('enemyVitalityFor', () => {
  it('follows the floor curve', () => {
    expect(enemyVitalityFor(makeNode({ floor: 1, type: 'normal' }))).toBe(100);
    expect(enemyVitalityFor(makeNode({ floor: 5, type: 'normal' }))).toBe(500);
    expect(enemyVitalityFor(makeNode({ floor: 4, type: 'elite' }))).toBe(600);
    expect(enemyVitalityFor(makeNode({ floor: 6, type: 'boss' }))).toBe(900);
  });

  it('applies the 1.2x bonus to the floor-36 boss', () => {
    expect(enemyVitalityFor(makeNode({ floor: 36, type: 'boss' }))).toBe(6480);
  });

  it('returns 0 for non-battle nodes', () => {
    expect(enemyVitalityFor(makeNode({ floor: 3, type: 'shop', enemyId: undefined }))).toBe(0);
    expect(enemyVitalityFor(makeNode({ floor: 3, type: 'event', enemyId: undefined }))).toBe(0);
  });
});

describe('PLAYER_VITALITY', () => {
  it('is 500', () => {
    expect(PLAYER_VITALITY).toBe(500);
  });
});
