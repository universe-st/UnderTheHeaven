import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

export const BianQueHuiSheng: SkillDefinition = {
  id: 'bianque_huisheng',
  name: '回生',
  description: '你气数降到0时，回复一半气数避免失败。每局只能触发一次。',
  timing: SkillTiming.AFTER_HEALTH_DECREASE,
  priority: 100,
  dialogLines: ['妙手回春！', '死而复生！'],

  filter: (ctx: SkillContext): boolean => {
    return ctx.target === 'player'
      && ctx.battle.player.vitality <= 0
      && !ctx.battle.player.reviveUsed;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const { battle } = ctx;

    battle.player.reviveUsed = true;
    const healAmount = Math.ceil(battle.player.vitalityMax / 2);

    visuals.playSkillTriggerSound();
    visuals.showHeal('player', healAmount);
  },
};
