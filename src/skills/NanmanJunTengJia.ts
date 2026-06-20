import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { applyNanmanTengjia } from '../engine/CharacterAbilities';

export const NanmanJunTengJia: SkillDefinition = {
  id: 'nanmanjun_tengjia',
  name: '藤甲',
  description: '敌方的黑色牌不计算伤害，红桃牌结算伤害乘以2',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 5,

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    return ctx.pattern !== undefined && ctx.damageInfo !== undefined;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    if (!ctx.pattern || !ctx.damageInfo) return;

    const { effectiveSumRanks } = applyNanmanTengjia(ctx.pattern.cards);
    ctx.damageInfo.sumRanks = effectiveSumRanks;
    ctx.damageInfo.finalDamage = Math.round(effectiveSumRanks * ctx.damageInfo.coefficient);

    visuals.playSkillTriggerSound();
  },
};
