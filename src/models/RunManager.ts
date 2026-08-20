import type { MapNode, NodeType, RunState, BuCiCard } from './RunState';
import { createNewRun, applyDefeat, applyVictory, tongbaoReward } from './RunState';
import { createRng } from '../engine/MapGenerator';

/** 旧版卜辞牌（handType/coefficientBonus 结构）整体作废，加载时丢弃重置为空栏 */
function migrateBuciCards(buciCards: unknown): BuCiCard[] {
  if (!Array.isArray(buciCards)) return [];
  return buciCards.filter((c): c is BuCiCard =>
    !!c && typeof c === 'object'
    && typeof (c as BuCiCard).count === 'number'
    && typeof (c as BuCiCard).effect === 'object'
    && (c as BuCiCard).effect !== null,
  );
}

const SAVE_KEY = 'uth_run_save';
const SAVE_VERSION = 1;

interface SaveData {
  version: number;
  run: RunState;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage 不可用（隐私模式抛异常 / 非浏览器环境）时的内存降级实现 */
const memoryBacking = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memoryBacking.get(key) ?? null,
  setItem: (key, value) => void memoryBacking.set(key, value),
  removeItem: (key) => void memoryBacking.delete(key),
};

function getStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      // 探测一次以触发隐私模式下的 SecurityError
      localStorage.getItem(SAVE_KEY);
      return localStorage;
    }
  } catch {
    // fall through
  }
  return memoryStorage;
}

let currentRun: RunState | null = null;

/**
 * 最近一次节点通过结算的利息（仅用于场景切换后的动画提示，不持久化）。
 * 消费后归零，避免同一利息被多次展示。
 */
let pendingInterest = 0;

/** 读取并清零待展示的利息 */
export function consumePendingInterest(): number {
  const v = pendingInterest;
  pendingInterest = 0;
  return v;
}

/** 开启新一局（可选种子，相同种子生成相同地图与初始角色） */
export function startNewRun(seed?: number): RunState {
  currentRun = createNewRun(createRng(seed ?? Date.now()));
  return currentRun;
}

export function getRun(): RunState | null {
  return currentRun;
}

export function setRun(run: RunState): void {
  currentRun = run;
}

export function hasSave(): boolean {
  try {
    return getStorage().getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** 将当前对局写入存档 */
export function save(): void {
  if (!currentRun) {
    return;
  }
  try {
    const data: SaveData = { version: SAVE_VERSION, run: currentRun };
    getStorage().setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // 存储不可用时静默失败，保持内存态
  }
}

/** 读取存档；解析失败或版本不符时清除存档并返回 false */
export function load(): boolean {
  let raw: string | null;
  try {
    raw = getStorage().getItem(SAVE_KEY);
  } catch {
    return false;
  }
  if (raw === null) {
    return false;
  }
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION || !data.run) {
      throw new Error('存档版本不符');
    }
    // 兼容旧存档：补充后加入的字段默认值；卜辞栏迁移（旧结构整体作废）
    data.run.cardPool ??= [];
    data.run.buciCards = migrateBuciCards(data.run.buciCards);
    data.run.characterMarkers ??= {};
    data.run.characterSkillFlags ??= {};
    data.run.scoreBoosts ??= {};
    currentRun = data.run;
    return true;
  } catch {
    clearSave();
    return false;
  }
}

/** 战斗结果写回入参 */
export interface BattleResultInput {
  nodeId: string;
  victory: boolean;
  /** 战败时敌方剩余气数百分比（0-100）；缺省按 100 计 */
  enemyVitalityPercent?: number;
  /** 胜利时确定的通宝奖励；缺省时内部按节点类型掷取 */
  reward?: number;
}

function findNode(run: RunState, nodeId: string): MapNode | null {
  for (const layer of run.layers) {
    for (const node of layer) {
      if (node.id === nodeId) return node;
    }
  }
  return null;
}

/**
 * 节点通过结算（商店离开、事件完成等）：推进层数、加通宝、结利息，
 * 并记录本次利息供返回地图后的动画提示。节点已清除时返回 null。
 */
export function settleNodeClear(node: MapNode, rewardOverride?: number): { reward: number; interest: number } | null {
  const run = currentRun;
  if (!run || node.cleared) return null;
  const settlement = applyVictory(run, node, Math.random, rewardOverride);
  pendingInterest = settlement.interest;
  return settlement;
}

/**
 * 战斗结束后将结果写回当前对局并落盘。
 * 胜利：清节点、推进层数、加通宝（事件节点按 normal 区间）、结利息、计数；
 * 失败：按敌方剩余气数扣天命（Boss 翻倍）。
 * 无对局或找不到节点时返回 null。
 */
export function applyBattleResult(result: BattleResultInput): RunState | null {
  const run = currentRun;
  if (!run) return null;
  const node = findNode(run, result.nodeId);
  if (!node) return null;

  if (result.victory) {
    const rewardType: NodeType = node.type === 'event' ? 'normal' : node.type;
    const reward = result.reward ?? tongbaoReward(rewardType, Math.random);
    const settlement = applyVictory(run, node, Math.random, reward);
    pendingInterest = settlement.interest;
  } else {
    // 战败不结算利息；清空此前悬挂的提示，避免错位显示
    pendingInterest = 0;
    applyDefeat(run, result.enemyVitalityPercent ?? 100, node.type === 'boss');
  }

  save();
  return run;
}

/** 清除当前对局与存档 */
export function clear(): void {
  currentRun = null;
  clearSave();
}

function clearSave(): void {
  try {
    getStorage().removeItem(SAVE_KEY);
  } catch {
    // 存储不可用时忽略
  }
}
