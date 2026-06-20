import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

export const ZhugeLiangTianSuan: SkillDefinition = {
  id: 'zhugeliang_tiansuan',
  name: '天算',
  description: '敌方始终随机有六张牌明置',
  timing: SkillTiming.PASSIVE_MODIFIER,

  filter: (_ctx: SkillContext): boolean => {
    return false;
  },

  execute: async (_ctx: SkillContext, _visuals: SkillVisualManager): Promise<void> => {
  },
};
