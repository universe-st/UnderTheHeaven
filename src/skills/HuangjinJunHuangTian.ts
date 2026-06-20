import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { sortHand } from '../models/Card';

export const HuangjinJunHuangTian: SkillDefinition = {
  id: 'huangjinjun_huangtian',
  name: '黄天',
  description: '获得牌权时，随机弃置一张点数最小的牌并摸一张',
  timing: SkillTiming.ON_TURN_START,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    return ctx.battle.enemy.hand.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.enemy.hand;
    if (hand.length === 0) return;

    let minRank = Infinity;
    const minIndices: number[] = [];
    for (let i = 0; i < hand.length; i++) {
      if (hand[i].rank < minRank) {
        minRank = hand[i].rank;
        minIndices.length = 0;
        minIndices.push(i);
      } else if (hand[i].rank === minRank) {
        minIndices.push(i);
      }
    }
    const idx = minIndices[Math.floor(Math.random() * minIndices.length)];
    hand.splice(idx, 1);

    const deck = ctx.battle.enemy.deck;
    if (deck.length === 0) {
      deck.push(...ctx.battle.enemy.discardPile.splice(0));
    }
    if (deck.length > 0) {
      hand.push(deck.pop()!);
      sortHand(hand);
    }

    visuals.playSkillTriggerSound();
  },
};
