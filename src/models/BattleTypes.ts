import type { Card } from './Card';
import type { PlayerCharacterId, EnemyCharacterId } from './Character';
import type { NodeType } from './RunState';

export enum HandType {
  Single,
  Pair,
  Triple,
  TripleOne,
  TriplePair,
  Straight,
  ConsecutivePairs,
  Airplane,
  AirplaneSingle,
  AirplanePair,
  Bomb,
  Rocket,
}

export const HAND_TYPE_LABELS: Record<HandType, string> = {
  [HandType.Single]: '单张',
  [HandType.Pair]: '对子',
  [HandType.Triple]: '三张',
  [HandType.TripleOne]: '三带一',
  [HandType.TriplePair]: '三带二',
  [HandType.Straight]: '顺子',
  [HandType.ConsecutivePairs]: '连对',
  [HandType.Airplane]: '飞机',
  [HandType.AirplaneSingle]: '飞机带单',
  [HandType.AirplanePair]: '飞机带对',
  [HandType.Bomb]: '炸弹',
  [HandType.Rocket]: '王炸',
};

export interface HandPattern {
  type: HandType;
  cards: Card[];
  mainValue: number;
  length: number;
}

export interface PlayerState {
  hand: Card[];
  deck: Card[];
  discardPile: Card[];
  vitality: number;
  vitalityMax: number;
  name: string;
  characterId?: PlayerCharacterId;
  reviveUsed?: boolean;
  /**
   * 关羽「武圣」判定依据：玩家最近一次「持有牌权主动出牌」时打出的红色牌数量。
   * 跟牌（player_respond）或非主动出牌时为 0；出完牌直接结算时也会被清零。
   */
  pendingRedCount?: number;
  /** 蓝玉「桀骜」：当前持有的"骜"标记数量 */
  aoMarkers?: number;
  /** 战斗中失去的角色牌（技能失效 + 角色栏变灰），如蓝玉「桀骜」负面效果 */
  lostCharacters?: PlayerCharacterId[];
  /**
   * 角色技能跨战斗状态（战斗内副本）：如周处「除害」移除大小王进度、
   * 是否已获得「励心」（同时失去「除害」）。战斗开始从 run.characterSkillFlags
   * 读入，结束写回。
   */
  skillFlags?: Record<string, boolean | number>;
  /** 本场战斗中玩家获得自对方的牌（如周处「除害」获得的红桃），战斗结束进入玩家牌库 */
  acquiredCards?: Card[];
}

export interface BattleState {
  player: PlayerState;
  enemy: PlayerState;
  enemyCharacterId?: EnemyCharacterId;
  turnHolder: 'player' | 'enemy';
  lastPlay: HandPattern | null;
  phase: 'play' | 'respond';
  turnCount: number;
}

/** Roguelike 局外循环进入战斗时由 MapScene 传入的节点信息 */
export interface RunModeConfig {
  nodeId: string;
  nodeType: NodeType;
  floor: number;
  enemyId: EnemyCharacterId;
  enemyVitality: number;
}

/**
 * GameScene 入场配置。
 * 全部字段可选：测试选择场景传入角色/气数等字段；
 * 局外循环（MapScene）只传 runMode，其余由 RunManager 的对局状态决定。
 */
export interface BattleConfig {
  selectedPlayerCharacterIds?: PlayerCharacterId[];
  enemyCharacterId?: EnemyCharacterId;
  playerVitality?: number;
  enemyVitality?: number;
  purchasedCards?: Card[];
  runMode?: RunModeConfig;
}
