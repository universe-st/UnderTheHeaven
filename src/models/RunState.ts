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

/** 八卦（上卦 / 下卦） */
export type Trigram = '乾' | '坤' | '震' | '巽' | '坎' | '离' | '艮' | '兑';

/** 卜辞卦象类型：主动（手动使用） / 被动（触发即用） */
export type BuCiType = 'active' | 'passive';

/**
 * 卦象效果定义（判别联合）。
 * 一次性：主动使用或被动触发都会消耗（count - 1）。
 */
export type BuCiEffect =
  | { kind: 'destiny_up'; maxInc: number; curInc: number } // 乾为天：天命上限+，天命+
  | { kind: 'block_battle_lose_deduction' } // 天水讼：抵挡一次战败天命扣减
  | { kind: 'save_from_zero' } // 天泽履：天命≤0 时回 1，避免失败
  | { kind: 'destiny_max_down_cur_up'; maxDown: number; curUp: number } // 天地否：上限-，天命+
  | { kind: 'destiny_up_on_battle_win'; amount: number } // 天火同人：战斗节点胜利回天命
  | { kind: 'event_autopick'; amount: number } // 天雷无妄：事件出选项随机选 + 回天命
  | { kind: 'skip_battle'; amount: number } // 天山遁：选战斗节点跳过 + 回天命
  | { kind: 'remove_character'; amount: number }; // 天风姤：移除角色牌 + 回天命

export interface BuCiCard {
  id: string;
  name: string;
  /** 上卦（用于分组与卦象图） */
  upper: Trigram;
  /** 下卦 */
  lower: Trigram;
  price: number;
  type: BuCiType;
  /** 效果描述文本（商店 / 栏位展示） */
  desc: string;
  effect: BuCiEffect;
  /** 堆叠数量：同卦可买多张，触发只消耗第一张 */
  count: number;
}

/** 出售价 = 购买价一半（向下取整） */
export function buciSellPrice(card: BuCiCard): number {
  return Math.floor(card.price / 2);
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
  /**
   * 角色跨战斗标记（如蓝玉「骜」）：角色 id → 标记数量。
   * 战斗开始时读入 BattleState，战斗结束后写回；角色失去（如桀骜反噬）时清零。
   */
  characterMarkers?: Record<string, number>;
  /**
   * 角色跨战斗技能状态（如周处「除害」：已移除过大王/小王、是否已获得「励心」）。
   * 键为 `角色id_状态名`，值为 boolean / number；战斗开始时读入 BattleState，
   * 战斗结束后合并写回。技能的失去与获得均永久生效。
   * 注：除害「移出」的牌本身仅本场战斗生效（敌方每场战斗牌库重建），
   * 持久化的只是移除进度与转换结果。
   */
  characterSkillFlags?: Record<string, boolean | number>;
  /**
   * 田文「养士」：卡牌分数跨战斗加成，键见 cardScoreBoostKey（`花色_点数`/`joker_点数`）。
   * 获得牌权时手牌分数 +1 并累计于此；每场战斗开始应用到玩家牌组（永久生效）。
   */
  scoreBoosts?: Record<string, number>;
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
/** 卜辞栏格数上限 */
export const BUCI_BAR_MAX = 3;

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
    characterMarkers: {},
    characterSkillFlags: {},
    scoreBoosts: {},
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
