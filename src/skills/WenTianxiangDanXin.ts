import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
} from './SkillTypes';
import { waitForCounterTween } from '../utils/AnimationUtils';

const DANXIN_BONUS = 10;

export const WenTianxiangDanXin: SkillDefinition = {
  id: 'wentianxiang_danxin',
  name: '丹心',
  description: '单牌伤害结算时，你的红桃牌计分+10',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 20,
  dialogLines: ['人生自古谁无死，留取丹心照汗青！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'heart';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const sc = ctx.singleCard;
    if (!sc) return;

    sc.scoreBonus = DANXIN_BONUS;

    visuals.playSkillTriggerSound();

    const scene = visuals.getScene();
    const targetScore = sc.baseScore + DANXIN_BONUS;

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
