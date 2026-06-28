import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type AIDecisionHook } from './SkillTypes';
import { HandType } from '../models/BattleTypes';
import { animateMultiplierUpdate } from '../utils/AnimationUtils';

const xiliangArmyOnAIDecision: AIDecisionHook = (plays, ctx) => {
  const handSize = ctx.hand.length;
  for (const p of plays) {
    const remaining = handSize - p.play.cards.length;
    if (remaining <= 0) {
      p.score += handSize <= 3 ? 30 : handSize <= 6 ? 15 : 5;
    }
    if (p.play.type === HandType.Straight ||
        p.play.type === HandType.Bomb ||
        p.play.type === HandType.Rocket) {
      p.score += 10;
    }
  }
};

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

  onAIDecision: xiliangArmyOnAIDecision,
};