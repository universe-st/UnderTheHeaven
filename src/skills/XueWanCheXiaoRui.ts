import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
} from './SkillTypes';
import { waitForCounterTween } from '../utils/AnimationUtils';

const XIAORUI_BONUS = 10;

export const XueWanCheXiaoRui: SkillDefinition = {
  id: 'xuewanche_xiaorui',
  name: '骁锐',
  description: '单牌伤害结算时，你的梅花牌计分+10',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['吾乃万人敌也！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'club';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const sc = ctx.singleCard;
    if (!sc) return;

    sc.scoreBonus += XIAORUI_BONUS;

    visuals.playSkillTriggerSound();

    const scene = visuals.getScene();
    const targetScore = sc.baseScore + XIAORUI_BONUS;

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
