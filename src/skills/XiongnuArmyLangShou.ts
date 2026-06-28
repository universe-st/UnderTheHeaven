import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type AIDecisionHook } from './SkillTypes';
import { HandType } from '../models/BattleTypes';

const xiongnuArmyOnAIDecision: AIDecisionHook = (plays) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single &&
        p.play.cards[0]?.suit === 'heart') {
      p.score += 15;
    }
  }
};

export const XiongnuArmyLangShou: SkillDefinition = {
  id: 'xiongnu_army_langshou',
  name: '狼狩',
  description: '单牌结算伤害后，若为红桃牌，你回复等同于结算伤害的气数',
  timing: SkillTiming.AFTER_SINGLE_CARD_SETTLEMENT,
  priority: 100,
  dialogLines: ['狼群围猎，饮血而生！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'heart';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const sc = ctx.singleCard!;
    const cardScore = sc.baseScore + sc.scoreBonus;
    if (cardScore <= 0) return;

    visuals.playSkillTriggerSound();
    visuals.showHeal('enemy', cardScore);
  },

  onAIDecision: xiongnuArmyOnAIDecision,
};