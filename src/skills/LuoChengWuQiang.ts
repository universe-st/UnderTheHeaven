import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
} from './SkillTypes';
import { waitForCounterTween } from '../utils/AnimationUtils';

const WUQIANG_BONUS = 10;

export const LuoChengWuQiang: SkillDefinition = {
  id: 'luocheng_wuqiang',
  name: '舞枪',
  description: '单牌伤害结算时，你的方片牌计分+10',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['看枪！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'diamond';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const sc = ctx.singleCard;
    if (!sc) return;

    sc.scoreBonus += WUQIANG_BONUS;

    visuals.playSkillTriggerSound();

    const scene = visuals.getScene();
    const targetScore = sc.baseScore + WUQIANG_BONUS;

    await waitForCounterTween(scene, {
      from: sc.baseScore,
      to: targetScore,
      duration: 400,
      ease: 'Cubic.easeOut',
      onUpdate: (val) => {
        sc.scoreText.setText(`+${Math.round(val)}`);
      },
    });
  },
};
