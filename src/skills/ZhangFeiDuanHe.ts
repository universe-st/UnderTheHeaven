import { SkillTiming, type SkillContext, type SkillDefinition, type SkillVisualManager } from './SkillTypes';
import { waitForDelay } from '../utils/AnimationUtils';

export const ZhangFeiDuanHe: SkillDefinition = {
  id: 'zhangfei_duanhe',
  name: '断喝',
  description: '若你手牌数量不大于四张，敌方对你结算伤害时，如果结算到了与你手牌中拥有花色的牌，你直接令已计数伤害归零并无效后续待结算牌。你获得牌权。',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 5,
  dialogLines: ['燕人张飞在此！', '谁敢与我一战！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (!ctx.singleCard) return false;
    const hand = ctx.battle.player.hand;
    if (hand.length > 4) return false;
    const cardSuit = ctx.singleCard.card.getData('suit') as string;
    return hand.some(c => c.suit === cardSuit);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();

    const scene = visuals.getScene();
    await waitForDelay(scene, 200);

    (scene as any).cancelDamageSettlement();
  },
};
