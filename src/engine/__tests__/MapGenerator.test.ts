import { describe, it, expect } from 'vitest';
import type { EnemyCharacterId } from '../../models/Character';
import type { MapNode } from '../../models/RunState';
import { generateMap, createRng } from '../MapGenerator';

const BOSS_FLOORS = [9, 18, 27, 36];
const BOSS_POOLS: Record<number, EnemyCharacterId[]> = {
  9: ['huangjinjun', 'nanmanjun', 'qiangdao'],
  18: ['xiliang_army', 'xiongnu_army'],
  27: ['mongol_army', 'banner_army'],
  36: ['mongol_army', 'banner_army', 'xiliang_army', 'xiongnu_army'],
};
const VALID_TYPES = new Set(['normal', 'elite', 'boss', 'shop', 'event']);
const BATTLE_TYPES = new Set(['normal', 'elite', 'boss']);

function assertMapInvariants(layers: MapNode[][]): void {
  expect(layers).toHaveLength(36);

  layers.forEach((nodes, idx) => {
    const floor = idx + 1;

    if (BOSS_FLOORS.includes(floor)) {
      expect(nodes).toHaveLength(1);
      const boss = nodes[0]!;
      expect(boss.type).toBe('boss');
      expect(boss.enemyId).toBeDefined();
      expect(BOSS_POOLS[floor]).toContain(boss.enemyId);
      return;
    }

    expect(nodes).toHaveLength(3);

    // 每层至少 1 个战斗节点
    expect(nodes.some((n) => BATTLE_TYPES.has(n.type))).toBe(true);
    // 类型合法
    for (const n of nodes) {
      expect(VALID_TYPES.has(n.type)).toBe(true);
      expect(n.floor).toBe(floor);
      expect(n.cleared).toBe(false);
    }
    // 商店/事件每层至多各 1 个
    expect(nodes.filter((n) => n.type === 'shop').length).toBeLessThanOrEqual(1);
    expect(nodes.filter((n) => n.type === 'event').length).toBeLessThanOrEqual(1);
    // 1-2 层无精英
    if (floor <= 2) {
      expect(nodes.some((n) => n.type === 'elite')).toBe(false);
    }
    // 每章冲刺段（Boss 前两层，floor%9 ∈ {7,8}）含 1-2 个精英
    if (floor % 9 === 7 || floor % 9 === 8) {
      const elites = nodes.filter((n) => n.type === 'elite').length;
      expect(elites).toBeGreaterThanOrEqual(1);
      expect(elites).toBeLessThanOrEqual(2);
    }
    // 战斗节点必须有 enemyId
    for (const n of nodes) {
      if (BATTLE_TYPES.has(n.type)) {
        expect(n.enemyId).toBeDefined();
      }
    }
  });
}

describe('generateMap', () => {
  it('generates a 36-floor map satisfying all invariants', () => {
    assertMapInvariants(generateMap(createRng(42)));
  });

  it('is reproducible for the same seed', () => {
    const a = generateMap(createRng(1234));
    const b = generateMap(createRng(1234));
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const a = JSON.stringify(generateMap(createRng(1)));
    const b = JSON.stringify(generateMap(createRng(2)));
    expect(a).not.toBe(b);
  });

  it('satisfies invariants across 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      assertMapInvariants(generateMap(createRng(seed)));
    }
  });
});

describe('createRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
