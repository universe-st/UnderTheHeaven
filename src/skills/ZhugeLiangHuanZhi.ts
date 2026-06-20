import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

export const ZhugeLiangHuanZhi: SkillDefinition = {
  id: 'zhugeliang_huanzhi',
  name: '还治',
  description: '你可以用相同的牌接住敌方的牌型，而不必用更大的',
  timing: SkillTiming.PASSIVE_MODIFIER,

  filter: (_ctx: SkillContext): boolean => {
    return false;
  },

  execute: async (_ctx: SkillContext, _visuals: SkillVisualManager): Promise<void> => {
  },
};
