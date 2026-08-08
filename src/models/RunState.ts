import type { HandType } from './BattleTypes';
import type { PlayerCharacterId, EnemyCharacterId } from './Character';
import { randomPlayerCharacter } from './Character';
import { generateMap } from '../engine/MapGenerator';
import type { Card } from './Card';

export type NodeType = 'normal' | 'elite' | 'boss' | 'shop' | 'event';

export interface MapNode {
  id: string;
  floor: number;
  index: number;
  type: NodeType;
  enemyId?: EnemyCharacterId;
  cleared: boolean;
}

export interface BuCiCard {
  id: string;
  name: string;
  handType: HandType;
  coefficientBonus: number;
}

export interface RunState {
  destiny: number;
  destinyMax: number;
  tongbao: number;
  floor: number;
  roster: PlayerCharacterId[];
  buciCards: BuCiCard[];
  /** 黄金台购买的扑克牌池，每场战斗融合进玩家牌库 */
  cardPool: Card[];
  layers: MapNode[][];
  bossKills: number;
  battlesWon: number;
}

/** 玩家气数（单场战斗） */
export const PLAYER_VITALITY = 500;

/** 初始天命 / 通宝 */
export const INITIAL_DESTINY = 100;
export const INITIAL_TONGBAO = 100;

/** 各节点类型的通宝奖励区间（含端点） */
export const TONGBAO_REWARD: Record<NodeType, { min: number; max: number }> = {
  normal: { min: 8, max: 15 },
  elite: { min: 20, max: 30 },
  boss: { min: 40, max: 60 },
  shop: { min: 0, max: 0 },
  event: { min: 0, max: 0 },
};

/** Boss 层（第 9/18/27/36 层，每 9 层一章） */
export const BOSS_FLOORS: readonly number[] = [9, 18, 27, 36];
/** 地图总层数 */
export const MAP_FLOORS = 36;
/** 阵容上限 */
export const ROSTER_MAX = 10;

export function createNewRun(rng: () => number): RunState {
  return {
    destiny: INITIAL_DESTINY,
    destinyMax: INITIAL_DESTINY,
    tongbao: INITIAL_TONGBAO,
    floor: 1,
    roster: [randomPlayerCharacter(rng)],
    buciCards: [],
    cardPool: [],
    layers: generateMap(rng),
    bossKills: 0,
    battlesWon: 0,
  };
}

/**
 * 战败天命损失：敌方剩余气数百分比 / 4 向上取整，Boss 翻倍。
 * 例：80% → 20，Boss → 40；1% → 1，Boss → 2；0% → 0。
 */
export function calcDestinyLoss(enemyVitalityPercent: number, isBoss: boolean): number {
  const base = Math.ceil(enemyVitalityPercent / 4);
  return isBoss ? base * 2 : base;
}

/** 按节点类型掷通宝奖励（含端点整数）；shop/event 恒为 0 */
export function tongbaoReward(nodeType: NodeType, rng: () => number): number {
  const { min, max } = TONGBAO_REWARD[nodeType];
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * 通宝利息：每持有 100 通宝结算 10 通宝利息（不足 100 不计）。
 * 例：100 → 10、250 → 20、99 → 0。
 */
export function interestOn(tongbao: number): number {
  return Math.floor(tongbao / 100) * 10;
}

/** 节点通过结算信息 */
export interface VictorySettlement {
  /** 节点本身的通宝奖励 */
  reward: number;
  /** 结算后按持有通宝计算的利息 */
  interest: number;
}

/**
 * 胜利结算：标记节点、推进层数、加通宝、结利息、计数。
 * 利息按“奖励入账后的持有通宝”结算：每 100 通宝 10 利息。
 * 返回本次的奖励与利息，供调用方做动画提示。
 */
export function applyVictory(
  run: RunState,
  node: MapNode,
  rng: () => number,
  rewardOverride?: number,
): VictorySettlement {
  node.cleared = true;
  if (node.floor === run.floor) {
    run.floor += 1;
  }
  const reward = rewardOverride ?? tongbaoReward(node.type, rng);
  run.tongbao += reward;
  const interest = interestOn(run.tongbao);
  run.tongbao += interest;
  if (node.type === 'boss') {
    run.bossKills += 1;
  }
  if (node.type === 'normal' || node.type === 'elite' || node.type === 'boss') {
    run.battlesWon += 1;
  }
  return { reward, interest };
}

/** 战败结算：按敌方剩余气数扣天命（下限 0），层数不变 */
export function applyDefeat(run: RunState, enemyVitalityPercent: number, isBoss: boolean): RunState {
  run.destiny = Math.max(0, run.destiny - calcDestinyLoss(enemyVitalityPercent, isBoss));
  return run;
}

/** 天命耗尽，本局结束 */
export function isRunOver(run: RunState): boolean {
  return run.destiny <= 0;
}

/** 第 36 层最终 Boss 已击破，本局通关 */
export function isRunComplete(run: RunState): boolean {
  const finalLayer = run.layers[MAP_FLOORS - 1];
  return finalLayer?.some((n) => n.type === 'boss' && n.cleared) ?? false;
}

/**
 * 敌方气数曲线：normal = 层数×100，elite/boss = 层数×150；
 * 第 36 层最终 Boss 额外 ×1.2 取整（36×150×1.2 = 6480）。非战斗节点为 0。
 */
export function enemyVitalityFor(node: MapNode): number {
  if (node.type === 'normal') {
    return node.floor * 100;
  }
  if (node.type === 'elite' || node.type === 'boss') {
    const base = node.floor * 150;
    return node.type === 'boss' && node.floor === MAP_FLOORS ? Math.round(base * 1.2) : base;
  }
  return 0;
}
