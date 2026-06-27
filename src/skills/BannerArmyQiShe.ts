import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HandType, type HandPattern } from '../models/BattleTypes';
import { type ResponseBlockModifier, registerResponseBlock } from './PassiveSkillUtils';

export const BannerArmyQiShe: SkillDefinition = {
  id: 'banner_army_qishe',
  name: '骑射',
  description: '打出方片花色的单张牌型时，对方无法用单张响应',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['骑射无双，箭无虚发！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (ctx.pattern?.type !== HandType.Single) return false;
    const cards = ctx.pattern?.cards;
    if (!cards || cards.length !== 1) return false;
    return cards[0]!.suit === 'diamond';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();
    const centerCards = ctx.centerCardContainers;
    if (centerCards && centerCards.length > 0) {
      visuals.animateCardScale(centerCards[0]!);
    }
  },
};

export const BannerArmyQiSheBlock: ResponseBlockModifier = {
  type: 'response_block',
  getBlockedTypes: (ctx: { lastPlay: HandPattern }): HandType[] => {
    const lp = ctx.lastPlay;
    if (lp.type === HandType.Single && lp.cards.length === 1 && lp.cards[0]!.suit === 'diamond') {
      return [HandType.Single];
    }
    return [];
  },
};

registerResponseBlock('banner_army', BannerArmyQiSheBlock);