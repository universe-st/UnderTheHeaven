import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { waitForDelay } from '../utils/AnimationUtils';

export const WenTianxiangDanXin: SkillDefinition = {
  id: 'wentianxiang_danxin',
  name: '丹心',
  description: '你的红桃牌结算伤害+10',
  timing: SkillTiming.ON_DAMAGE_CALCULATED,
  priority: 20,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.pattern || !ctx.damageInfo) return false;
    if (ctx.target !== 'enemy') return false;
    const heartCount = ctx.pattern.cards.filter(c => c.suit === 'heart').length;
    return heartCount > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    if (!ctx.pattern || !ctx.damageInfo) return;

    const heartCount = ctx.pattern.cards.filter(c => c.suit === 'heart').length;
    const bonus = heartCount * 10;

    ctx.damageInfo.finalDamage += bonus;

    visuals.playSkillTriggerSound();

    const scene = visuals.getScene();
    await waitForDelay(scene, 100);

    const heartContainers = (ctx.centerCardContainers || [])
      .filter(c => (c.getData('suit') as string) === 'heart');
    if (heartContainers.length > 0) {
      visuals.animateCardScale(heartContainers, 1.35, 200);
    }
  },
};
