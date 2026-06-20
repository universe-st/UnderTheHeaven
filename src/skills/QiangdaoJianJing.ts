import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';

export const QiangdaoJianJing: SkillDefinition = {
  id: 'qiangdao_jianjing',
  name: '剪径',
  description: '造成伤害后，随机获得你的一张牌',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    return ctx.battle.player.hand.length > 0;
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
};
