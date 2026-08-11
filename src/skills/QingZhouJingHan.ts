import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

export const QingZhouJingHan: SkillDefinition = {
  id: 'qingzhou_jinghan',
  name: '精悍',
  description: '受到伤害后，恢复伤害值20%的气数',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 100,
  dialogLines: ['青州儿郎，愈战愈勇！', '区区小伤，何足挂齿！'],

  // AFTER_DAMAGE 在目标存活时才会 emit；target === 'enemy' 表示敌方受到伤害后触发
  filter: (ctx: SkillContext): boolean => {
    return ctx.target === 'enemy';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();

    // 回复伤害值 20% 的气数（四舍五入）；damageInfo 缺失时按 0 处理
    const heal = Math.round((ctx.damageInfo?.finalDamage ?? 0) * 0.2);
    if (heal <= 0) return;

    // showHeal 会真正增加气数并 clamp 到 vitalityMax
    visuals.showHeal('enemy', heal);
  },
};
