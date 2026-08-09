import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type ResponseBlockModifier } from './SkillTypes';
import { HandType, type HandPattern } from '../models/BattleTypes';

/** 除王炸（Rocket）外的全部牌型，供「诗仙」封锁响应使用 */
export const BLOCKED_ALL_BUT_ROCKET: HandType[] = [
  HandType.Single,
  HandType.Pair,
  HandType.Triple,
  HandType.TripleOne,
  HandType.TriplePair,
  HandType.Straight,
  HandType.ConsecutivePairs,
  HandType.Airplane,
  HandType.AirplaneSingle,
  HandType.AirplanePair,
  HandType.Bomb,
];

/** 判断牌型是否为 5 张或 7 张 */
function isFiveOrSevenCards(pattern: HandPattern | undefined | null): boolean {
  if (!pattern) return false;
  return pattern.cards.length === 5 || pattern.cards.length === 7;
}

export const LiBaiShiXian: SkillDefinition = {
  id: 'libai_shixian',
  name: '诗仙',
  description: '你打出的牌如果是五张或者七张，只能被"王炸"响应',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['天生我材必有用！', '千金散尽还复来！', '仰天大笑出门去！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    return isFiveOrSevenCards(ctx.pattern);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();
    const centerCards = ctx.centerCardContainers;
    if (centerCards && centerCards.length > 0) {
      visuals.animateCardScale(centerCards);
    }
  },
};

export const LiBaiShiXianBlock: ResponseBlockModifier = {
  type: 'response_block',
  getBlockedTypes: (ctx: { lastPlay: HandPattern }): HandType[] => {
    if (isFiveOrSevenCards(ctx.lastPlay)) {
      return BLOCKED_ALL_BUT_ROCKET;
    }
    return [];
  },
};
