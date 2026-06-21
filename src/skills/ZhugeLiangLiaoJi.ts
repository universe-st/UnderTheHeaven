import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
} from './SkillTypes';
import { nullifyCardDamage } from './SkillUtils';

export const ZhugeLiangLiaoJi: SkillDefinition = {
  id: 'zhugeliang_liaoji',
  name: '料机',
  description: '单牌伤害结算时，【明置】状态的牌不计算分数',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 20,
  dialogLines: ['此招我早已算到，不足为惧！', '料敌机先，尔等伤不得我！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (!ctx.playerCharacterIds.includes('zhugeliang')) return false;
    if (!ctx.singleCard) return false;
    return ctx.singleCard.card.getData('isRevealed') === true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await nullifyCardDamage(ctx, visuals);
  },
};
