import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { animateMultiplierUpdate } from '../utils/AnimationUtils';

export const XiliangArmyHanYong: SkillDefinition = {
  id: 'xiliang_army_hanyong',
  name: '悍勇',
  description: '结算伤害时，若没有手牌，伤害倍数+3',
  timing: SkillTiming.ON_DAMAGE_MULTIPLIER_REVEALED,
  priority: 100,
  dialogLines: ['悍勇无畏，背水一战！'],

  filter: (ctx: SkillContext): boolean => {
    return ctx.target === 'player' && ctx.isEmptyHand === true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const { damageInfo, multiplierLabel } = ctx;
    if (!damageInfo || !multiplierLabel) return;

    const oldMultiplier = damageInfo.damageMultiplier;
    const newMultiplier = oldMultiplier + 3;
    damageInfo.damageMultiplier = newMultiplier;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * newMultiplier,
    );

    const scene = visuals.getScene();
    visuals.playSkillTriggerSound();
    await animateMultiplierUpdate(scene, multiplierLabel, oldMultiplier, newMultiplier, 800);
  },
};