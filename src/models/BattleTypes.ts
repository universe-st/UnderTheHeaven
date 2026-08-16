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
  /** 韩世忠「忠武」：当前持有的"忠武"标记数量（响应对方的牌时+1，结算消耗，受伤/对局结束清空） */
  zhongwuMarkers?: number;
  /** 周公旦「制礼」：开局弃置的点数列表（这些点数的牌本次对局不计算伤害；主动技可弃此类牌摸牌） */
  zhiliRanks?: number[];
  /** 战斗中失去的角色牌（技能失效 + 角色从角色区消失），如蓝玉「桀骜」负面效果 */
  lostCharacters?: PlayerCharacterId[];
  /**
   * 角色技能跨战斗状态（战斗内副本）：如周处「除害」移除大小王进度、
   * 是否已获得「励心」（同时失去「除害」）。战斗开始从 run.characterSkillFlags
   * 读入，结束写回。
   */
  skillFlags?: Record<string, boolean | number>;
  /** 本场战斗中玩家获得自对方的牌（如周处「除害」获得的红桃），战斗结束进入玩家牌库 */
  acquiredCards?: Card[];
  /**
   * 田文「养士」：本场战斗内累计的卡牌分数加成（键见 cardScoreBoostKey）。
   * 获得牌权触发技能时累加；战斗结束由 BattleFlowManager 合并写回 run.scoreBoosts（跨对局继承）。
   */
  scoreBoosts?: Record<string, number>;
}

export interface BattleState {
  player: PlayerState;
  enemy: PlayerState;
  enemyCharacterId?: EnemyCharacterId;
  turnHolder: 'player' | 'enemy';
  lastPlay: HandPattern | null;
  phase: 'play' | 'respond';
  turnCount: number;
  /**
   * 当前一圈敌方打出的所有牌（含临时牌）。敌方每手出牌时 append，
   * 每圈结算完成清桌时清空（清空点在 ON_ENEMY_PASS emit 之后，姜尚「垂钓」要读）。
   */
  roundEnemyCards: Card[];
  /** 孙膑「减灶」：本手牌周期弃置三张牌的总分数（默认 0） */
  jianzaoBonus: number;
  /** 孙膑「减灶」：效果是否生效（发动后 true，玩家打光手牌后 false） */
  jianzaoActive: boolean;
  /**
   * 倭寇「劫海」：本场战斗中被劫走的玩家手牌（深拷贝记录，仅记录不移出原数组）。
   * 敌方被击败（玩家胜利）后，这些牌无条件全量写回玩家牌库（见 BattleFlowManager 结算）。
   * 可选字段：GameScene.initBattle() 初始化为 []，技能侧读取前兜底初始化。
   */
  wokouStolenCards?: Card[];
  /**
   * 周瑜「反间」：被标记的敌方手牌 uid（主动技【反间】随机标记一张敌方手牌）。
   * 无标记 / 标记已触发 / 周瑜不在阵容时为 undefined。
   * 标记在「玩家获得牌权」时过期清空（见 BattleFlowManager.emitPlayerGainTurn）；
   * 敌方打出含标记牌的整手牌时被反间劫持，对敌方结算伤害（见 BattleFlowManager 劫持点）。
   */
  fanjianMarkedUid?: string;
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
