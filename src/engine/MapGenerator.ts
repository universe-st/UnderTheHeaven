import type { EnemyCharacterId } from '../models/Character';
import type { MapNode, NodeType } from '../models/RunState';

/** mulberry32 伪随机数工厂：同一种子产生完全一致的序列 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_ENEMIES: EnemyCharacterId[] = [
  'huangjinjun',
  'nanmanjun',
  'qiangdao',
  'shizu',
  'banner_army',
  'mongol_army',
  'xiliang_army',
  'xiongnu_army',
];

/** 强敌池：精英节点偏向选取，第 36 层最终 Boss 从此池选取 */
const STRONG_ENEMIES: EnemyCharacterId[] = ['mongol_army', 'banner_army', 'xiliang_army', 'xiongnu_army'];

/** 各 Boss 层的敌人池（每 9 层一个 Boss，共 4 个） */
const BOSS_POOLS: Record<number, EnemyCharacterId[]> = {
  9: ['huangjinjun', 'nanmanjun', 'qiangdao'],
  18: ['xiliang_army', 'xiongnu_army'],
  27: ['mongol_army', 'banner_army'],
  36: STRONG_ENEMIES,
};

const BOSS_FLOOR_SET = new Set([9, 18, 27, 36]);
const TOTAL_FLOORS = 36;
const NODES_PER_FLOOR = 3;
/** 精英节点从强敌池选取的概率 */
const ELITE_STRONG_CHANCE = 0.6;
const SHOP_CHANCE = 0.4;
const EVENT_CHANCE = 0.4;

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)]!;
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

function enemyFor(type: NodeType, rng: () => number): EnemyCharacterId | undefined {
  if (type === 'normal') {
    return pick(ALL_ENEMIES, rng);
  }
  if (type === 'elite') {
    return rng() < ELITE_STRONG_CHANCE ? pick(STRONG_ENEMIES, rng) : pick(ALL_ENEMIES, rng);
  }
  return undefined;
}

function generateFloor(floor: number, rng: () => number): MapNode[] {
  // Boss 层：单个 boss 节点
  if (BOSS_FLOOR_SET.has(floor)) {
    return [
      {
        id: `f${floor}n0`,
        floor,
        index: 0,
        type: 'boss',
        enemyId: pick(BOSS_POOLS[floor]!, rng),
        cleared: false,
      },
    ];
  }

  // 精英数量：1-2 层无精英；每章冲刺段（Boss 前两层，floor%9 ∈ {7,8}）1-2 个；其余层 0-1 个
  const inFinalStretch = floor % 9 === 7 || floor % 9 === 8;
  let eliteCount: number;
  if (floor <= 2) {
    eliteCount = 0;
  } else if (inFinalStretch) {
    eliteCount = 1 + Math.floor(rng() * 2);
  } else {
    eliteCount = rng() < 0.5 ? 1 : 0;
  }

  const shopCount = rng() < SHOP_CHANCE ? 1 : 0;
  const eventCount = rng() < EVENT_CHANCE ? 1 : 0;

  let normalCount = NODES_PER_FLOOR - eliteCount - shopCount - eventCount;
  if (normalCount < 0) {
    // 仅冲刺段层可能出现（2 精英 + 商店 + 事件）：减少精英保证节点总数
    eliteCount += normalCount;
    normalCount = 0;
  }

  const types: NodeType[] = [
    ...Array<NodeType>(eliteCount).fill('elite'),
    ...Array<NodeType>(normalCount).fill('normal'),
    ...Array<NodeType>(shopCount).fill('shop'),
    ...Array<NodeType>(eventCount).fill('event'),
  ];
  shuffle(types, rng);

  return types.map((type, index) => ({
    id: `f${floor}n${index}`,
    floor,
    index,
    type,
    enemyId: enemyFor(type, rng),
    cleared: false,
  }));
}

/**
 * 生成 36 层 Roguelike 地图（数组下标 0 = 第 1 层）。
 * 第 9/18/27/36 层为单个 Boss 节点（每 9 层一章），其余层 3 个节点；
 * 每层至少 1 个战斗节点，商店/事件每层至多各 1 个。
 */
export function generateMap(rng: () => number): MapNode[][] {
  const layers: MapNode[][] = [];
  for (let floor = 1; floor <= TOTAL_FLOORS; floor++) {
    layers.push(generateFloor(floor, rng));
  }
  return layers;
}
