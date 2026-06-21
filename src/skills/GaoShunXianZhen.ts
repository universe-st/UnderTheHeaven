import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
} from './SkillTypes';
import { waitForCounterTween } from '../utils/AnimationUtils';

const XIANZHEN_BONUS = 10;

export const GaoShunXianZhen: SkillDefinition = {
  id: 'gaoshun_xianzhen',
  name: '陷阵',
  description: '单牌伤害结算时，你的黑桃牌计分+10',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['陷阵之志，有死无生！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'spade';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const sc = ctx.singleCard;
    if (!sc) return;

    sc.scoreBonus += XIANZHEN_BONUS;

    visuals.playSkillTriggerSound();

    const scene = visuals.getScene();
    const targetScore = sc.baseScore + XIANZHEN_BONUS;

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
