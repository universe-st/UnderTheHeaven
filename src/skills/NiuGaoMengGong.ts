import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { discardCardsFromHand } from '../utils/CardActions';

export const NiuGaoMengGong: SkillDefinition = {
  id: 'niugao_menggong',
  name: '猛攻',
  description: '你造成伤害后，若对方手牌数不小于10，随机弃置其一张牌',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    return ctx.battle.enemy.hand.length >= 10;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.enemy.hand;
    if (hand.length < 10) return;

    const idx = Math.floor(Math.random() * hand.length);

    visuals.playSkillTriggerSound();
    await discardCardsFromHand(ctx.gameScene, 'enemy', [idx]);
  },
};
