import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type AIDecisionHook } from './SkillTypes';
import { HandType } from '../models/BattleTypes';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';

const mongolArmyOnAIDecision: AIDecisionHook = (plays) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single &&
        p.play.cards[0]?.suit === 'spade') {
      p.score += 15;
    }
  }
};

export const MongolArmyQiangLve: SkillDefinition = {
  id: 'mongol_army_qianglve',
  name: '抢掠',
  description: '单牌结算伤害时，若为黑桃牌，获得对方一张牌',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 100,
  dialogLines: ['驰骋草原，抢夺你的粮草！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'spade';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const playerHand = ctx.battle.player.hand;
    if (playerHand.length === 0) return;

    const idx = Math.floor(Math.random() * playerHand.length);

    visuals.playSkillTriggerSound();
    const [stolen] = await discardCardsFromHand(ctx.gameScene, 'player', [idx], {
      skipDiscardPile: true,
    });
    if (stolen) {
      await addCardsToHand(ctx.gameScene, 'enemy', [stolen]);
    }
  },

  onAIDecision: mongolArmyOnAIDecision,
};