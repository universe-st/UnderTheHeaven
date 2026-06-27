import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import { animateCoefficientUpdate } from '../utils/AnimationUtils';

export const ZhangHanJueShou: SkillDefinition = {
  id: 'zhanghan_jueshou',
  name: '绝守',
  description: '你的气数损失每有10%，伤害结算时系数时+0.3。',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 5,
  dialogLines: ['坚守不退！', '绝命之守！'],

  filter: (ctx: SkillContext): boolean => {
    return ctx.target === 'enemy'
      && ctx.damageInfo !== undefined
      && ctx.centerCardContainers !== undefined
      && ctx.centerCardContainers.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, coefficientLabel, pattern, battle } = ctx;
    if (!damageInfo) return;

    const vitalityRatio = battle.player.vitality / battle.player.vitalityMax;
    const lossPercent = (1 - vitalityRatio) * 100;
    const tenthsLost = Math.floor(lossPercent / 10);

    if (tenthsLost < 1) return;

    const cappedTenths = Math.min(tenthsLost, 9);
    const bonusCoefficient = cappedTenths * 0.3;
    const newCoefficient = damageInfo.baseCoefficient + bonusCoefficient;

    visuals.playSkillTriggerSound();

    damageInfo.coefficient = newCoefficient;
    damageInfo.finalDamage = Math.round(damageInfo.sumRanks * newCoefficient);

    if (coefficientLabel && pattern) {
      const typeLabel = HAND_TYPE_LABELS[pattern.type];
      await animateCoefficientUpdate(
        scene,
        coefficientLabel,
        typeLabel,
        damageInfo.baseCoefficient,
        newCoefficient,
        800,
      );
    }
  },
};
