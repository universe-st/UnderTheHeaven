import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

/**
 * 戚继光「荡寇」：若你打出的牌数量超出对方手牌数，结算伤害时所有牌额外结算一次。
 *
 * - 时机 ON_SINGLE_CARD_SETTLEMENT：单牌逐张结算时，"所有牌额外结算一次" =
 *   每张牌在基础结算完成后（放大/缩小动画结束、分数累加后）再完整结算一次。
 *   通过 singleCard.extraSettlements += 1 声明，由 DamageSettlementManager 的
 *   settleSingleCard 循环实现 —— 额外结算轮会再次触发单牌结算技能（如罗成「舞枪」、
 *   薛万彻「骁锐」），多个效果（白虎印、豪放）叠加 = 额外结算多次。
 * - filter 中 `isExtraSettlement` 排除额外结算轮：额外结算不会递归再触发本技能。
 * - 与李清照「豪放」同构（按"牌数 > 对方手牌数"整体判定，非单花色加成，
 *   不使用 createSuitScoreBonusSkill 工厂）。
 */
export const QiJiGuangDangKou: SkillDefinition = {
  id: 'qijiguang_dangkou',
  name: '荡寇',
  description: '若你打出的牌数量超出对方手牌数，结算伤害时所有牌额外结算一次',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['封侯非我意，但愿海波平！', '倭寇不灭，何以家为？', '威震海疆，荡平贼寇！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    // 额外结算轮不递归触发本技能（否则额外结算会无限叠加）
    if (ctx.singleCard.isExtraSettlement) return false;
    if (!ctx.pattern) return false;
    // 打出牌数量超出对方手牌数（"超出" = 严格大于）
    return ctx.pattern.cards.length > ctx.battle.enemy.hand.length;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    if (!ctx.singleCard) return;
    visuals.playSkillTriggerSound();
    // 额外结算一次 = 声明一次额外结算（由结算循环在基础轮后完整重放一轮）
    ctx.singleCard.extraSettlements = (ctx.singleCard.extraSettlements ?? 0) + 1;
  },
};
