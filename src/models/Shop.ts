import { PLAYER_CHARACTER_LIST } from './Character';
import type { PlayerCharacterId } from './Character';
import type { BuCiCard, RunState } from './RunState';
import { getBuciMods, ROSTER_MAX, BUCI_BAR_MAX } from './RunState';
import type { Card } from './Card';
import { getNextCardId, rankToLabel, SUITS, CARD_RANKS } from './Card';
import { randomSeal, SEAL_PRICE_EXTRA, CARD_SLOT_CHANCE } from './FourSeal';
import { applyBuciPurchaseHooks, applyBuciSellHooks } from '../engine/BuciEffects';

export type ShopItem =
  | { kind: 'character'; characterId: PlayerCharacterId; price: number }
  | { kind: 'buci'; buci: BuCiCard; price: number }
  | { kind: 'card'; card: Card; price: number }
  | { kind: 'heal'; amount: 10; price: number };

/** 使用场景：默认黄金台 + 战斗主动阶段 */
const DEFAULT_USAGE = ['shop', 'battle'] as const;

/**
 * 六十四卦·卜辞目录（全量 64 卦，按上卦分 8 宫，每宫 8 卦）。
 * 设计定稿见 docs/design/game/16-六十四卦卜辞牌设计.md。
 */
export const HEXAGRAM_CATALOG: { buci: BuCiCard; price: number }[] = [
  // ═══ 天宫（上乾 · 天命与命运）═══
  { buci: { id: 'hex_qian_wei_tian', name: '乾为天', upper: '乾', lower: '乾', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '天命上限 +15，同时天命 +15', effect: { kind: 'destiny_up', maxInc: 15, curInc: 15 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_tian_shui_song', name: '天水讼', upper: '乾', lower: '坎', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '抵挡一次战斗失败引起的天命扣减', effect: { kind: 'block_battle_lose_deduction' }, count: 1 }, price: 30 },
  { buci: { id: 'hex_tian_ze_lv', name: '天泽履', upper: '乾', lower: '兑', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '天命被扣减到 0 以下时，恢复到 1，避免游戏失败', effect: { kind: 'save_from_zero' }, count: 1 }, price: 40 },
  { buci: { id: 'hex_tian_di_pi', name: '天地否', upper: '乾', lower: '坤', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '扣减 40 点天命上限，恢复 25 点天命', effect: { kind: 'destiny_max_down_cur_up', maxDown: 40, curUp: 25 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_tian_huo_tong_ren', name: '天火同人', upper: '乾', lower: '离', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '在战斗节点取得胜利则恢复 10 点天命', effect: { kind: 'destiny_up_on_battle_win', amount: 10 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_tian_lei_wu_wang', name: '天雷无妄', upper: '乾', lower: '震', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '在「事件」节点需选择选项时，恢复 10 点天命，随机为你选择一个', effect: { kind: 'event_autopick', amount: 10 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_tian_shan_dun', name: '天山遁', upper: '乾', lower: '艮', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '选择「战斗」节点时，跳过战斗，增加 10 点天命', effect: { kind: 'skip_battle', amount: 10 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_tian_feng_gou', name: '天风姤', upper: '乾', lower: '巽', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '移除一张角色牌，增加 10 点天命；无角色牌不得使用', effect: { kind: 'remove_character', amount: 10 }, count: 1 }, price: 40 },

  // ═══ 地宫（上坤 · 阵容与招募）═══
  { buci: { id: 'hex_kun_wei_di', name: '坤为地', upper: '坤', lower: '坤', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '牌库随机 7 张中选 2 张赐玄武印（不足则全选）', effect: { kind: 'grant_seal_to_pool', pick: 2, candidates: 7 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_di_tian_tai', name: '地天泰', upper: '坤', lower: '乾', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '阵容上限 +1（本局，可叠加）', effect: { kind: 'roster_max_up', amount: 1 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_di_shui_shi', name: '地水师', upper: '坤', lower: '坎', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '招募一名角色时，牌库随机 2 张获玄武印', effect: { kind: 'grant_seal_on_recruit', count: 2 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_di_lei_fu', name: '地雷复', upper: '坤', lower: '震', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '角色被移除时返还 15 通宝', effect: { kind: 'refund_on_remove_character', amount: 15 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_di_ze_lin', name: '地泽临', upper: '坤', lower: '兑', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '下次招募角色费用 -30%', effect: { kind: 'recruit_discount', percent: 30 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_di_huo_ming_yi', name: '地火明夷', upper: '坤', lower: '离', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '战斗失败后，下次招募费用 -50%', effect: { kind: 'recruit_discount_after_defeat', percent: 50 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_di_feng_sheng', name: '地风升', upper: '坤', lower: '巽', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '招募角色时天命 +5', effect: { kind: 'destiny_up_on_recruit', amount: 5 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_di_shan_qian', name: '地山谦', upper: '坤', lower: '艮', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '下次出售物品额外 +50% 通宝（一次）', effect: { kind: 'sell_bonus', percent: 50 }, count: 1 }, price: 20 },

  // ═══ 雷宫（上震 · 速度与推进）═══
  { buci: { id: 'hex_zhen_wei_lei', name: '震为雷', upper: '震', lower: '震', price: 50, type: 'active', rarity: 'legendary', usage: ['map', ...DEFAULT_USAGE], desc: '选择任一未通过节点，按胜利结算直接通过', effect: { kind: 'pass_any_node' }, count: 1 }, price: 50 },
  { buci: { id: 'hex_lei_di_yu', name: '雷地豫', upper: '震', lower: '坤', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '本场战斗节点胜利通宝奖励 ×2', effect: { kind: 'battle_reward_mult', mult: 2 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_lei_feng_heng', name: '雷风恒', upper: '震', lower: '巽', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '商店刷新费用固定为 5 通宝（不再递增）', effect: { kind: 'refresh_fixed', price: 5 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_lei_tian_da_zhuang', name: '雷天大壮', upper: '震', lower: '乾', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: 'Boss 节点胜利通宝奖励 ×2', effect: { kind: 'boss_reward_mult', mult: 2 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_lei_shui_jie', name: '雷水解', upper: '震', lower: '坎', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '事件节点扣天命/通宝类选项代价减半（一次）', effect: { kind: 'event_cost_half' }, count: 1 }, price: 20 },
  { buci: { id: 'hex_lei_ze_gui_mei', name: '雷泽归妹', upper: '震', lower: '兑', price: 40, type: 'active', rarity: 'rare', usage: ['map', ...DEFAULT_USAGE], desc: '立即推进一层（跳过本层剩余节点，无奖励）', effect: { kind: 'advance_floor' }, count: 1 }, price: 40 },
  { buci: { id: 'hex_lei_huo_feng', name: '雷火丰', upper: '震', lower: '离', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '事件节点获得通宝奖励时翻倍（一次）', effect: { kind: 'event_tongbao_mult', mult: 2 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_lei_shan_xiao_guo', name: '雷山小过', upper: '震', lower: '艮', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '战斗节点胜利额外 +5 通宝', effect: { kind: 'battle_reward_extra', amount: 5 }, count: 1 }, price: 20 },

  // ═══ 风宫（上巽 · 牌库与牌组）═══
  { buci: { id: 'hex_xun_wei_feng', name: '巽为风', upper: '巽', lower: '巽', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '从牌库移除最多 3 张牌，每移除 1 张 +8 通宝', effect: { kind: 'remove_cards_for_tongbao', max: 3, per: 8 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_feng_tian_xiao_chu', name: '风天小畜', upper: '巽', lower: '乾', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '购买扑克牌时额外获得 1 张随机扑克牌', effect: { kind: 'extra_card_on_buy', count: 1 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_feng_di_guan', name: '风地观', upper: '巽', lower: '坤', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '每场战斗开始手牌 +1', effect: { kind: 'battle_start_hand', amount: 1 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_feng_huo_jia_ren', name: '风火家人', upper: '巽', lower: '离', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '牌库选 1 张复制 1 张加入牌库', effect: { kind: 'copy_card_to_pool', count: 1 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_feng_lei_yi', name: '风雷益', upper: '巽', lower: '震', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '购买扑克牌价格 -5', effect: { kind: 'card_buy_discount', amount: 5 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_feng_shan_jian', name: '风山渐', upper: '巽', lower: '艮', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '带印扑克牌出现概率 +25%（商店）', effect: { kind: 'seal_chance_up', percent: 25 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_feng_shui_huan', name: '风水涣', upper: '巽', lower: '坎', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '战斗开始时敌方手牌 -1', effect: { kind: 'enemy_hand_down', amount: 1 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_feng_ze_zhong_fu', name: '风泽中孚', upper: '巽', lower: '兑', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '战斗胜利时牌库随机 2 张各 +1 点数', effect: { kind: 'pool_score_up_on_win', count: 2, inc: 1 }, count: 1 }, price: 40 },

  // ═══ 水宫（上坎 · 经济与通宝）═══
  { buci: { id: 'hex_kan_wei_shui', name: '坎为水', upper: '坎', lower: '坎', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '通宝 +60，且本局通宝利息 +50%', effect: { kind: 'tongbao_gain_interest', amount: 60, interestPercent: 50 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_shui_lei_tun', name: '水雷屯', upper: '坎', lower: '震', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '每进入一个节点 +2 通宝', effect: { kind: 'tongbao_per_node', amount: 2 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_shui_tian_xu', name: '水天需', upper: '坎', lower: '乾', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '下次出售物品返还全价（一次）', effect: { kind: 'sell_full_price' }, count: 1 }, price: 30 },
  { buci: { id: 'hex_shui_di_bi', name: '水地比', upper: '坎', lower: '坤', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '商店商品价格 -15%', effect: { kind: 'shop_discount', percent: 15 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_shui_shan_jian', name: '水山蹇', upper: '坎', lower: '艮', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '商店刷新免费 1 次', effect: { kind: 'refresh_free' }, count: 1 }, price: 30 },
  { buci: { id: 'hex_shui_feng_jing', name: '水风井', upper: '坎', lower: '巽', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '每次进入黄金台 +10 通宝', effect: { kind: 'tongbao_per_shop', amount: 10 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_shui_ze_jie', name: '水泽节', upper: '坎', lower: '兑', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '购买物品返还 10% 通宝（节流）', effect: { kind: 'cashback', percent: 10 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_shui_huo_ji_ji', name: '水火既济', upper: '坎', lower: '离', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '通宝 +40，且本局下一次商店商品 -20%', effect: { kind: 'tongbao_gain_discount', amount: 40, nextShopDiscount: 20 }, count: 1 }, price: 40 },

  // ═══ 火宫（上离 · 战斗与伤害）═══
  { buci: { id: 'hex_li_wei_huo', name: '离为火', upper: '离', lower: '离', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '本局所有战斗气数上限 +150', effect: { kind: 'vitality_up_all_battle', amount: 150 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_huo_tian_da_you', name: '火天大有', upper: '离', lower: '乾', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '战斗节点胜利时牌库随机 1 张扑克牌入牌库', effect: { kind: 'drop_card_on_win', count: 1 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_huo_lei_shi_ke', name: '火雷噬嗑', upper: '离', lower: '震', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '下一场战斗牌型系数 +1', effect: { kind: 'battle_coefficient_boost', amount: 1 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_huo_di_jin', name: '火地晋', upper: '离', lower: '坤', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '精英节点胜利额外 +20 通宝', effect: { kind: 'elite_reward_extra', amount: 20 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_huo_ze_kui', name: '火泽睽', upper: '离', lower: '兑', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '下一次战斗开始时随机移除敌方 1 张牌', effect: { kind: 'remove_enemy_card', count: 1 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_huo_feng_ding', name: '火风鼎', upper: '离', lower: '巽', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '战斗胜利时牌库随机 1 张获得随机四象印', effect: { kind: 'grant_seal_on_win', count: 1 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_huo_shan_lv', name: '火山旅', upper: '离', lower: '艮', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '下一场战斗胜利额外 +25 通宝', effect: { kind: 'next_battle_reward_extra', amount: 25 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_huo_shui_wei_ji', name: '火水未济', upper: '离', lower: '坎', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '战斗失败不扣天命，改为天命上限 -10', effect: { kind: 'defeat_loss_to_max', maxDown: 10 }, count: 1 }, price: 40 },

  // ═══ 山宫（上艮 · 防御与保护）═══
  { buci: { id: 'hex_gen_wei_shan', name: '艮为山', upper: '艮', lower: '艮', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '获得 60 点天命护盾（抵挡后续天命扣减）', effect: { kind: 'destiny_shield', amount: 60 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_shan_feng_gu', name: '山风蛊', upper: '艮', lower: '巽', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '战斗失败天命扣减减半（一次）', effect: { kind: 'defeat_loss_half' }, count: 1 }, price: 30 },
  { buci: { id: 'hex_shan_huo_bi', name: '山火贲', upper: '艮', lower: '离', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '天命 +15，并获得 15 点护盾', effect: { kind: 'heal_and_shield', heal: 15, shield: 15 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_shan_di_bo', name: '山地剥', upper: '艮', lower: '坤', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '天命护盾效果 +50%（获得护盾时生效）', effect: { kind: 'shield_power_up', percent: 50 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_shan_tian_da_xu', name: '山天大畜', upper: '艮', lower: '乾', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '天命上限 +20', effect: { kind: 'destiny_max_up', amount: 20 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_shan_lei_yi', name: '山雷颐', upper: '艮', lower: '震', price: 40, type: 'passive', rarity: 'rare', usage: [], desc: '本局第一次战斗失败不扣天命', effect: { kind: 'first_defeat_no_loss' }, count: 1 }, price: 40 },
  { buci: { id: 'hex_shan_ze_sun', name: '山泽损', upper: '艮', lower: '兑', price: 30, type: 'active', rarity: 'fine', usage: [...DEFAULT_USAGE], desc: '移除牌库 1 张牌，天命 +20（无牌不可用）', effect: { kind: 'remove_card_heal', heal: 20 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_shan_shui_meng', name: '山水蒙', upper: '艮', lower: '坎', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '抵挡一次事件节点造成的天命扣减', effect: { kind: 'block_event_destiny_loss' }, count: 1 }, price: 20 },

  // ═══ 泽宫（上兑 · 回复与资源）═══
  { buci: { id: 'hex_dui_wei_ze', name: '兑为泽', upper: '兑', lower: '兑', price: 50, type: 'active', rarity: 'legendary', usage: [...DEFAULT_USAGE], desc: '天命 +40，且本局天命恢复效果 +5', effect: { kind: 'destiny_heal_regen', heal: 40, regenBonus: 5 }, count: 1 }, price: 50 },
  { buci: { id: 'hex_ze_lei_sui', name: '泽雷随', upper: '兑', lower: '震', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '每次进入黄金台回复 10 天命', effect: { kind: 'heal_on_shop', amount: 10 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_ze_feng_da_guo', name: '泽风大过', upper: '兑', lower: '巽', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '天命 +35，但下一场战斗胜利通宝奖励 -20', effect: { kind: 'overdraw_heal', heal: 35, penalty: 20 }, count: 1 }, price: 40 },
  { buci: { id: 'hex_ze_shan_xian', name: '泽山咸', upper: '兑', lower: '艮', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '使用其他主动卦时额外回 5 天命', effect: { kind: 'extra_heal_on_active', amount: 5 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_ze_di_cui', name: '泽地萃', upper: '兑', lower: '坤', price: 20, type: 'passive', rarity: 'common', usage: [], desc: '事件选择非负面选项时额外回 8 天命', effect: { kind: 'heal_on_good_event', amount: 8 }, count: 1 }, price: 20 },
  { buci: { id: 'hex_ze_shui_kun', name: '泽水困', upper: '兑', lower: '坎', price: 30, type: 'passive', rarity: 'fine', usage: [], desc: '天命低于 30 时，战斗节点胜利回 20 天命', effect: { kind: 'win_heal_if_low', amount: 20, threshold: 30 }, count: 1 }, price: 30 },
  { buci: { id: 'hex_ze_huo_ge', name: '泽火革', upper: '兑', lower: '离', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '将黄金台一件未购买商品替换为同价格随机商品', effect: { kind: 'replace_shop_item' }, count: 1 }, price: 40 },
  { buci: { id: 'hex_ze_tian_guai', name: '泽天夬', upper: '兑', lower: '乾', price: 40, type: 'active', rarity: 'rare', usage: [...DEFAULT_USAGE], desc: '天命上限 +15、天命 +30', effect: { kind: 'destiny_up', maxInc: 15, curInc: 30 }, count: 1 }, price: 40 },
];

/**
 * 将卦象加入卜辞栏：同卦堆叠（count +1），否则新增一格。
 * 卜辞栏共 3 格，满格时返回 false（不加入）。
 */
export function addBuciToBar(run: RunState, buci: BuCiCard): boolean {
  if (buci.count <= 0) buci.count = 1;
  const existing = run.buciCards.find((c) => c.id === buci.id);
  if (existing) {
    existing.count += buci.count;
    return true;
  }
  if (run.buciCards.length >= 3) {
    return false;
  }
  run.buciCards.push({ ...buci });
  return true;
}

/** 出售卜辞栏中某卦一张：返还售价（购买价一半），count-1，归零移除。 */
export function sellBuci(run: RunState, id: string): number {
  const idx = run.buciCards.findIndex((c) => c.id === id);
  if (idx < 0) return 0;
  const card = run.buciCards[idx]!;
  // 出售前结算卖出增益卦（地山谦 +50% / 水天需 返全价），命中则先消耗增益卦
  const baseRefund = Math.floor(card.price / 2);
  const refund = applyBuciSellHooks(run, baseRefund);
  // 增益卦消耗可能使栏位索引位移，重新定位后再扣减
  const newIdx = run.buciCards.findIndex((c) => c.id === id);
  if (newIdx >= 0) {
    const target = run.buciCards[newIdx]!;
    target.count -= 1;
    if (target.count <= 0) run.buciCards.splice(newIdx, 1);
  }
  run.tongbao += refund;
  return refund;
}

/** 角色售价 = 招募费用 × 15 */
export const CHARACTER_PRICE_FACTOR = 15;
export const HEAL_ITEM: ShopItem = { kind: 'heal', amount: 10, price: 30 };

/**
 * 角色售价表（原“费用 × 15”折算）：3 → 45、5 → 75、8 → 120。
 * 费用属性已从角色数据中移除，定价直接在此维护。
 */
export const CHARACTER_PRICES: Record<PlayerCharacterId, number> = {
  bianque: 45,
  hanxin: 120,
  liubowen: 75,
  lishizhen: 45,
  zhugeliang: 120,
  wentianxiang: 75,
  libai: 120,
  niugao: 45,
  luocheng: 75,
  xuewanche: 75,
  gaoshun: 75,
  zhangfei: 75,
  zhanghan: 75,
  zuchongzhi: 75,
  guanyu: 120,
  lanyu: 75,
  zhaogao: -30,
  zhangjuzheng: 75,
  zhouchu: 120,
  baozheng: 120,
  lvbuwei: 120,
  huamulan: 75,
  shangguanwaner: 120,
  liqingzhao: 120,
  qijiguang: 120,
  zhuangzhou: 120,
  weizheng: 75,
  zhangliang: 120,
  xiangyu: 120,
  jiangshang: 120,
  sunbin: 120,
  suqin: 75,
  jingke: 120,
  yiyin: 75,
  hairui: 45,
  chengyaojin: 75,
  hanshizhong: 120,
  zhougongdan: 120,
  tianwen: 120,
  zhouyu: 120,
  dongfangshuo: 75,
  mengke: 120,
  diqing: 120,
  xuda: 120,
  sunwu: 120,
  xiangao: 75,
  tangyin: 120,
  yansong: -120,
  luyu: 75,
  huoqubing: 120,
  yuchigong: 120,
  lili: 105,
};

/** 黄金台刷新费用：基础 5 通宝，每刷新一次 +1 */
export const REFRESH_BASE_PRICE = 5;

export function refreshPrice(refreshCount: number): number {
  return REFRESH_BASE_PRICE + refreshCount;
}

/**
 * 结算卦象修饰后的实际刷新费用：
 * - 雷风恒：刷新费固定（不再递增）
 * - 水山蹇：免费刷新次数优先抵扣
 */
export function effectiveRefreshPrice(run: RunState, refreshCount: number): number {
  const mods = getBuciMods(run);
  if (mods.freeRefreshCount > 0) {
    return 0;
  }
  if (mods.refreshFixed !== null) {
    return mods.refreshFixed;
  }
  return refreshPrice(refreshCount);
}

const SHOP_STOCK_SIZE = 4;
const HEAL_CHANCE = 0.3;

export function characterPrice(characterId: PlayerCharacterId): number {
  const price = CHARACTER_PRICES[characterId];
  if (price === undefined) {
    throw new Error(`未知角色: ${characterId}`);
  }
  return price;
}

/** 扑克牌售价 = 点数（虎 25 / 龙 30），带印再加价 */
export function cardPrice(card: Card): number {
  return card.rank + (card.seal ? SEAL_PRICE_EXTRA : 0);
}

/** 按总折扣百分比（0-100）取整折价，最低 1 */
function discountedPrice(base: number, percent: number): number {
  if (percent <= 0) return base;
  return Math.max(1, Math.round((base * (100 - percent)) / 100));
}

/**
 * 生成一张随机的标准扑克牌（54 张等概率），带印概率 = 25% + sealChanceExtra（风山渐）。
 */
export function randomShopCard(rng: () => number, sealChanceExtra = 0): Card {
  const normalCount = SUITS.length * CARD_RANKS.length; // 52
  const total = normalCount + 2; // + 虎 / 龙
  const r = Math.floor(rng() * total);
  if (r >= normalCount) {
    const rank = r === total - 1 ? 30 : 25;
    return {
      uid: getNextCardId(),
      suit: null,
      rank,
      rankLabel: rankToLabel(rank),
      score: rank,
      seal: randomSeal(rng, sealChanceExtra) ?? undefined,
    };
  }
  const suit = SUITS[Math.floor(r / CARD_RANKS.length)]!;
  const rank = CARD_RANKS[r % CARD_RANKS.length]!;
  return {
    uid: getNextCardId(),
    suit,
    rank,
    rankLabel: rankToLabel(rank),
    score: rank,
    seal: randomSeal(rng, sealChanceExtra) ?? undefined,
  };
}

/**
 * 生成 4 件商店商品：1-2 个未招募角色（阵容满则不出角色）、
 * 其余为卜辞牌 / 扑克牌（每个卜辞槽位按 CARD_SLOT_CHANCE 概率变为扑克牌槽位），
 * 约 30% 概率含 1 个天命回复。
 * 卦象修饰：水地比 / 水火既济 折扣计入商品价；风山渐 提升带印概率；
 * 地泽临 / 地火明夷 招募折扣计入角色价。水火既济折扣一次性（本次库存结算后清空）。
 */
export function generateShopStock(run: RunState, rng: () => number): ShopItem[] {
  const mods = getBuciMods(run);
  const items: ShopItem[] = [];
  const wantHeal = rng() < HEAL_CHANCE;

  const goodsDiscount = mods.shopDiscount + mods.nextShopDiscount;
  const recruitDiscount = mods.recruitDiscount + mods.recruitDiscountAfterDefeat;

  const rosterMax = ROSTER_MAX + mods.rosterMaxUp;
  const rosterFull = run.roster.length >= rosterMax;
  const unrecruited = PLAYER_CHARACTER_LIST.filter((c) => !run.roster.includes(c.id));
  const maxCharSlots = wantHeal ? 2 : 3;
  const charCount = rosterFull ? 0 : Math.min(1 + Math.floor(rng() * 2), unrecruited.length, maxCharSlots);

  // 随机选取不重复的未招募角色
  const pool = [...unrecruited];
  for (let i = 0; i < charCount; i++) {
    const idx = Math.floor(rng() * pool.length);
    const character = pool.splice(idx, 1)[0]!;
    items.push({ kind: 'character', characterId: character.id, price: discountedPrice(characterPrice(character.id), goodsDiscount + recruitDiscount) });
  }

  const slotCount = SHOP_STOCK_SIZE - charCount - (wantHeal ? 1 : 0);
  for (let i = 0; i < slotCount; i++) {
    if (rng() < CARD_SLOT_CHANCE) {
      // 扑克牌槽位：购买后进入己方牌库；风山渐 提升带印概率
      const card = randomShopCard(rng, mods.sealChanceUp);
      items.push({ kind: 'card', card, price: discountedPrice(cardPrice(card), goodsDiscount) });
    } else {
      const entry = HEXAGRAM_CATALOG[Math.floor(rng() * HEXAGRAM_CATALOG.length)]!;
      items.push({ kind: 'buci', buci: { ...entry.buci, count: 1 }, price: discountedPrice(entry.price, goodsDiscount) });
    }
  }

  if (wantHeal) {
    items.push({ ...HEAL_ITEM, price: discountedPrice(HEAL_ITEM.price, goodsDiscount) });
  }

  // 水火既济：折扣只作用于"下一次商店"的本次库存
  if (mods.nextShopDiscount > 0) {
    run.buciMods = { ...mods, nextShopDiscount: 0 };
  }

  return items;
}

/**
 * 购买商品：通宝不足（或阵容已满仍买角色）返回 false 且状态不变；
 * 成功则扣款并入账（角色入阵容、卜辞入 buciCards、扑克牌入 cardPool、回复天命不超上限），
 * 并结算购买触发类卦象（水泽节返利 / 风雷益牌价 / 风天小畜加牌 / 地水师赐印 / 地风升回天命 / 地泽临·地火明夷消耗折扣）。
 */
export function purchase(run: RunState, item: ShopItem): boolean {
  if (run.tongbao < item.price) {
    return false;
  }
  const rosterMax = ROSTER_MAX + getBuciMods(run).rosterMaxUp;
  if (item.kind === 'character' && (run.roster.length >= rosterMax || run.roster.includes(item.characterId))) {
    return false;
  }
  // 卜辞栏满格且非同卦（不可堆叠）时不可购买
  if (
    item.kind === 'buci'
    && !run.buciCards.some((c) => c.id === item.buci.id)
    && run.buciCards.length >= BUCI_BAR_MAX
  ) {
    return false;
  }
  run.tongbao -= item.price;
  switch (item.kind) {
    case 'character':
      run.roster.push(item.characterId);
      break;
    case 'buci':
      addBuciToBar(run, item.buci);
      break;
    case 'card':
      run.cardPool.push({ ...item.card });
      break;
    case 'heal':
      run.destiny = Math.min(run.destinyMax, run.destiny + item.amount);
      break;
  }
  applyBuciPurchaseHooks(run, item);
  return true;
}
