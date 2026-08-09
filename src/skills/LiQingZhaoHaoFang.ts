import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';

/**
 * 李清照「豪放」：若你打出的牌均为红色且不小于五张，每张牌额外结算一次伤害。
 *
 * - 红色 = suit 为 'heart'（红桃）或 'diamond'（方片）；王（suit 为 null）不满足"均为红色"，自动排除。
 * - 时机 ON_SINGLE_CARD_SETTLEMENT：单牌逐张结算时，"每张牌额外结算一次伤害" = 该张牌计分翻倍，
 *   即 scoreBonus += baseScore，最终计分 = 2 × baseScore。
 * - 非单花色加成（红/黑两色整体加成），不使用 createSuitScoreBonusSkill 工厂。
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
    if (!ctx.pattern) return false;
    if (ctx.pattern.cards.length < 5) return false;
    // 王（suit 为 null）不满足 heart/diamond，every 自动返回 false
    return ctx.pattern.cards.every((c) => c.suit === 'heart' || c.suit === 'diamond');
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const baseScore = ctx.singleCard?.baseScore;
    if (baseScore === undefined) return;
    // 额外结算一次 = 计分翻倍：scoreBonus += baseScore，最终计分 2 × baseScore
    await modifyCardDamage(ctx, visuals, baseScore);
  },
};
