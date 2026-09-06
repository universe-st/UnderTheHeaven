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

/** 八卦 → 拉丁码（用于卦象图资源命名） */
export const TRIGRAM_CODES: Record<Trigram, string> = {
  乾: 'qian', 坤: 'kun', 震: 'zhen', 巽: 'xun', 坎: 'kan', 离: 'li', 艮: 'gen', 兑: 'dui',
};

/** 卦象图资源 key：`hex_<上卦码>_<下卦码>`，与 public/hex_*.png 对应 */
export function hexagramImageKey(upper: Trigram, lower: Trigram): string {
  return `hex_${TRIGRAM_CODES[upper]}_${TRIGRAM_CODES[lower]}`;
}

/** 卜辞卦象类型：主动（手动使用） / 被动（触发即用） */
export type BuCiType = 'active' | 'passive';

/** 稀有度：普通 / 精良 / 稀有 / 传说（传说 = 八纯卦专属） */
export type BuCiRarity = 'common' | 'fine' | 'rare' | 'legendary';

/** 稀有度展示元数据（程序化卡面：卜辞栏 / 商店卡共用） */
export const BUCI_RARITY_META: Record<BuCiRarity, { label: string; border: number; mark: string }> = {
  common: { label: '凡', border: 0x5a4030, mark: '#a89070' },
  fine: { label: '良', border: 0x2f7d4f, mark: '#8fe0a8' },
  rare: { label: '珍', border: 0x2f5d9f, mark: '#a0ccff' },
  legendary: { label: '传', border: 0xc8a050, mark: '#ffd98a' },
};

/** 主动卦使用场景：默认 ['shop','battle']；推进类（震为雷/雷泽归妹）含 'map' */
export type BuCiUsage = 'shop' | 'battle' | 'map';

/**
 * 卦象效果定义（判别联合）。
 * 一次性：主动使用或被动触发都会消耗（count - 1）。
 * 分组对应 [16-六十四卦卜辞牌设计] §16.5。
 */
export type BuCiEffect =
  // ── 天命数值（天宫） ──
  | { kind: 'destiny_up'; maxInc: number; curInc: number } // 乾为天
  | { kind: 'destiny_max_down_cur_up'; maxDown: number; curUp: number } // 天地否
  // ── 天命防护（山宫 / 天宫） ──
  | { kind: 'block_battle_lose_deduction' } // 天水讼
  | { kind: 'save_from_zero' } // 天泽履
  | { kind: 'destiny_shield'; amount: number } // 艮为山
  | { kind: 'heal_and_shield'; heal: number; shield: number } // 山火贲
  | { kind: 'shield_power_up'; percent: number } // 山地剥
  | { kind: 'defeat_loss_half' } // 山风蛊
  | { kind: 'first_defeat_no_loss' } // 山雷颐
  | { kind: 'defeat_loss_to_max'; maxDown: number } // 火水未济
  | { kind: 'block_event_destiny_loss' } // 山水蒙
  | { kind: 'destiny_max_up'; amount: number } // 山天大畜
  // ── 天命回复（泽宫） ──
  | { kind: 'destiny_heal_regen'; heal: number; regenBonus: number } // 兑为泽
  | { kind: 'overdraw_heal'; heal: number; penalty: number } // 泽风大过
  | { kind: 'remove_card_heal'; heal: number } // 山泽损
  | { kind: 'destiny_up_on_battle_win'; amount: number } // 天火同人
  | { kind: 'win_heal_if_low'; amount: number; threshold: number } // 泽水困
  | { kind: 'heal_on_shop'; amount: number } // 泽雷随
  | { kind: 'extra_heal_on_active'; amount: number } // 泽山咸
  | { kind: 'heal_on_good_event'; amount: number } // 泽地萃
  | { kind: 'destiny_up_on_recruit'; amount: number } // 地风升
  // ── 事件 / 节点（天宫·雷宫） ──
  | { kind: 'event_autopick'; amount: number } // 天雷无妄
  | { kind: 'skip_battle'; amount: number } // 天山遁
  | { kind: 'pass_any_node' } // 震为雷
  | { kind: 'advance_floor' } // 雷泽归妹
  | { kind: 'event_cost_half' } // 雷水解
  | { kind: 'event_tongbao_mult'; mult: number } // 雷火丰
  // ── 阵容 / 招募（地宫） ──
  | { kind: 'remove_character'; amount: number } // 天风姤
  | { kind: 'roster_max_up'; amount: number } // 地天泰
  | { kind: 'recruit_discount'; percent: number } // 地泽临
  | { kind: 'recruit_discount_after_defeat'; percent: number } // 地火明夷
  | { kind: 'refund_on_remove_character'; amount: number } // 地雷复
  // ── 通宝 / 经济（水宫） ──
  | { kind: 'tongbao_gain_interest'; amount: number; interestPercent: number } // 坎为水
  | { kind: 'tongbao_gain_discount'; amount: number; nextShopDiscount: number } // 水火既济
  | { kind: 'sell_full_price' } // 水天需
  | { kind: 'sell_bonus'; percent: number } // 地山谦
  | { kind: 'shop_discount'; percent: number } // 水地比
  | { kind: 'cashback'; percent: number } // 水泽节
  | { kind: 'refresh_free' } // 水山蹇
  | { kind: 'refresh_fixed'; price: number } // 雷风恒
  | { kind: 'tongbao_per_node'; amount: number } // 水雷屯
  | { kind: 'tongbao_per_shop'; amount: number } // 水风井
  | { kind: 'replace_shop_item' } // 泽火革
  // ── 战斗奖励（雷宫·火宫） ──
  | { kind: 'battle_reward_mult'; mult: number } // 雷地豫
  | { kind: 'boss_reward_mult'; mult: number } // 雷天大壮
  | { kind: 'battle_reward_extra'; amount: number } // 雷山小过
  | { kind: 'next_battle_reward_extra'; amount: number } // 火山旅
  | { kind: 'elite_reward_extra'; amount: number } // 火地晋
  // ── 牌库（cardPool）操作（风宫·地宫·火宫） ──
  | { kind: 'grant_seal_to_pool'; pick: number; candidates: number } // 坤为地
  | { kind: 'grant_seal_on_recruit'; count: number } // 地水师
  | { kind: 'grant_seal_on_win'; count: number } // 火风鼎
  | { kind: 'drop_card_on_win'; count: number } // 火天大有
  | { kind: 'pool_score_up_on_win'; count: number; inc: number } // 风泽中孚
  | { kind: 'remove_cards_for_tongbao'; max: number; per: number } // 巽为风
  | { kind: 'copy_card_to_pool'; count: number } // 风火家人
  | { kind: 'extra_card_on_buy'; count: number } // 风天小畜
  | { kind: 'card_buy_discount'; amount: number } // 风雷益
  | { kind: 'seal_chance_up'; percent: number } // 风山渐
  // ── 局内（战斗状态，共 5 张） ──
  | { kind: 'vitality_up_all_battle'; amount: number } // 离为火
  | { kind: 'battle_coefficient_boost'; amount: number } // 火雷噬嗑
  | { kind: 'remove_enemy_card'; count: number } // 火泽睽
  | { kind: 'battle_start_hand'; amount: number } // 风地观
  | { kind: 'enemy_hand_down'; amount: number }; // 风水涣

/**
 * 六十四卦·本局修饰状态：需要跨时点保存的常驻/一次性效果。
 * 纯一次性触发（卦在栏位即触发、触发即消耗）不占用此结构，直接由引擎函数处理。
 * 全部字段有默认值（DEFAULT_BUCI_MODS），读取请用 getBuciMods()。
 */
export interface BuciModifiers {
  /** 天命护盾（抵挡后续天命扣减）——艮为山 / 山火贲 */
  destinyShield: number;
  /** 本局天命恢复效果 +N ——兑为泽 */
  regenBonus: number;
  /** 护盾量 +N% ——山地剥 */
  shieldPowerUp: number;
  /** 阵容上限 +N——地天泰 */
  rosterMaxUp: number;
  /** 下次招募费用 -N%（地泽临使用后，招募时消耗） */
  recruitDiscount: number;
  /** 战败后下次招募 -N%（地火明夷触发后，招募时消耗） */
  recruitDiscountAfterDefeat: number;
  /** 通宝利息 +N%——坎为水 */
  interestBonusPercent: number;
  /** 下一次商店商品 -N%（水火既济，生成库存时消耗） */
  nextShopDiscount: number;
  /** 商店商品常驻 -N%——水地比 */
  shopDiscount: number;
  /** 购买返还 N% 通宝——水泽节 */
  cashbackPercent: number;
  /** 带印牌出现概率 +N%——风山渐 */
  sealChanceUp: number;
  /** 商店刷新价固定（不再递增）——雷风恒 */
  refreshFixed: number | null;
  /** 免费刷新次数——水山蹇 */
  freeRefreshCount: number;
  /** 购买扑克牌 -N 通宝——风雷益 */
  cardBuyDiscount: number;
  /** 购买扑克牌额外 +N 张——风天小畜 */
  extraCardOnBuy: number;
  /** 每进入节点 +N 通宝——水雷屯 */
  tongbaoPerNode: number;
  /** 每次进店 +N 通宝——水风井 */
  tongbaoPerShop: number;
  /** 每次进店回 N 天命——泽雷随 */
  healPerShop: number;
  /** 下一场战斗胜利通宝 -N（泽风大过使用后，胜利时消耗） */
  nextBattleRewardPenalty: number;
  /** 本局所有战斗气数上限 +N——离为火 */
  vitalityUpAllBattle: number;
  /** 下一场战斗开始时移除敌方 N 张牌（火泽睽使用后，战斗开始消耗） */
  removeEnemyCardNext: boolean;
}

export const DEFAULT_BUCI_MODS: BuciModifiers = {
  destinyShield: 0,
  regenBonus: 0,
  shieldPowerUp: 0,
  rosterMaxUp: 0,
  recruitDiscount: 0,
  recruitDiscountAfterDefeat: 0,
  interestBonusPercent: 0,
  nextShopDiscount: 0,
  shopDiscount: 0,
  cashbackPercent: 0,
  sealChanceUp: 0,
  refreshFixed: null,
  freeRefreshCount: 0,
  cardBuyDiscount: 0,
  extraCardOnBuy: 0,
  tongbaoPerNode: 0,
  tongbaoPerShop: 0,
  healPerShop: 0,
  nextBattleRewardPenalty: 0,
  vitalityUpAllBattle: 0,
  removeEnemyCardNext: false,
};

/** 读取某局卦象修饰状态（合并默认值，缺省字段安全） */
export function getBuciMods(run: RunState): BuciModifiers {
  return { ...DEFAULT_BUCI_MODS, ...(run.buciMods ?? {}) };
}

export interface BuCiCard {
  id: string;
  name: string;
  /** 上卦（用于分组与卦象图） */
  upper: Trigram;
  /** 下卦 */
  lower: Trigram;
  price: number;
  type: BuCiType;
  /** 稀有度（普通/精良/稀有/传说，卡面边框色区分） */
  rarity: BuCiRarity;
  /** 主动卦使用场景：默认 ['shop','battle']；推进类含 'map' */
  usage: BuCiUsage[];
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
  /**
   * 李离「伏剑」遗产：永久禁分花色列表（如 ['spade', 'club']）。
   * 李离发动「伏剑」移除自身时写入，自此之后的所有对局中，
   * 敌方打出该花色的牌结算伤害永不计分（跨局持久化）。
   * 战斗开始时注入 BattleState / 由隐藏技能读取，李离移除后依旧生效。
   */
  permanentSuitBans?: Card['suit'][];
  /**
   * 事件系统 v2：气数上限永久加成（事件「气数上限 +N」累积，跨战斗生效）。
   * 每场战斗玩家气数上限 = PLAYER_VITALITY(500) + vitalityMaxBoost。
   */
  vitalityMaxBoost?: number;
  /** 事件系统 v2：本局已触发过的每局唯一事件 id 列表（可遇难求及以上） */
  eventsTriggered?: string[];
  /** 事件系统 v2：遭遇战胜利后的额外通宝奖励（battle_with_reward），战斗胜利结算后清零 */
  pendingEventBattleReward?: number;
  /** 六十四卦·本局修饰状态（一次性卦触发后留下的常驻/一次性效果），读取用 getBuciMods() */
  buciMods?: Partial<BuciModifiers>;
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
    permanentSuitBans: [],
    vitalityMaxBoost: 0,
    eventsTriggered: [],
    pendingEventBattleReward: 0,
    buciMods: {},
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
