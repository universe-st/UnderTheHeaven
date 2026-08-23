import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

/**
 * 李清照「豪放」：若你打出的牌均为红色且不小于五张，每张牌额外结算一次伤害。
 *
 * - 红色 = suit 为 'heart'（红桃）或 'diamond'（方片）；王（suit 为 null）不满足"均为红色"，自动排除。
 * - 时机 ON_SINGLE_CARD_SETTLEMENT：单牌逐张结算时，"每张牌额外结算一次伤害" =
 *   该张牌在基础结算完成后（放大/缩小动画结束、分数累加后）再完整结算一次。
 *   通过 singleCard.extraSettlements += 1 声明，由 DamageSettlementManager 的
 *   settleSingleCard 循环实现 —— 额外结算轮会再次触发单牌结算技能（如罗成「舞枪」、
 *   薛万彻「骁锐」），多个效果（白虎印、荡寇）叠加 = 额外结算多次。
 * - filter 中 `isExtraSettlement` 排除额外结算轮：额外结算不会递归再触发本技能。
 */
export const LiQingZhaoHaoFang: SkillDefinition = {
  id: 'liqingzhao_haofang',
  name: '豪放',
  description: '若你打出的牌均为红色且不小于五张，每张牌额外结算一次伤害',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['生当作人杰，死亦为鬼雄。', '九万里风鹏正举。风休住，蓬舟吹取三山去！', '至今思项羽，不肯过江东。'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    // 额外结算轮不递归触发本技能（否则额外结算会无限叠加）
    if (ctx.singleCard.isExtraSettlement) return false;
    if (!ctx.pattern) return false;
    if (ctx.pattern.cards.length < 5) return false;
    // 王（suit 为 null）不满足 heart/diamond，every 自动返回 false
    return ctx.pattern.cards.every((c) => c.suit === 'heart' || c.suit === 'diamond');
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    if (!ctx.singleCard) return;
    visuals.playSkillTriggerSound();
    // 额外结算一次 = 声明一次额外结算（由结算循环在基础轮后完整重放一轮）
    ctx.singleCard.extraSettlements = (ctx.singleCard.extraSettlements ?? 0) + 1;
  },
};
