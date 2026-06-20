import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

export const LiuBoWenChouSuan: SkillDefinition = {
  id: 'liubowen_chousuan',
  name: '筹算',
  description: '你可以将黑桃牌当做癞子牌打出',
  timing: SkillTiming.PASSIVE_MODIFIER,

  filter: (_ctx: SkillContext): boolean => {
    return false;
  },

  execute: async (_ctx: SkillContext, _visuals: SkillVisualManager): Promise<void> => {
  },
};
