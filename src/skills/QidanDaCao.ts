import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';

export const QidanDaCao: SkillDefinition = {
  id: 'qidan_dacao',
  name: '打草',
  description: '受到伤害后，随机获得对方一张牌；若为梅花牌，回复5%气数',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 100,
  dialogLines: ['打草惊蛇，顺便牵羊！', '这张牌，归我了！'],

  // AFTER_DAMAGE 在目标存活时才会 emit；此处 target === 'enemy' 表示敌方受到伤害后触发
  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    return ctx.battle.player.hand.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const playerHand = ctx.battle.player.hand;
    if (playerHand.length === 0) return;

    const idx = Math.floor(Math.random() * playerHand.length);

    visuals.playSkillTriggerSound();

    // 随机抢玩家一张牌（skipDiscardPile：不进入玩家弃牌堆，被抢牌战斗结束永久失去）
    const [stolen] = await discardCardsFromHand(ctx.gameScene, 'player', [idx], {
      skipDiscardPile: true,
    });
    if (!stolen) return;

    await addCardsToHand(ctx.gameScene, 'enemy', [stolen]);

    // 梅花牌回复 5% 最大气数（四舍五入）；大王/小王 suit 为 null，不触发回血
    if (stolen.suit === 'club') {
      visuals.showHeal('enemy', Math.round(ctx.battle.enemy.vitalityMax * 0.05));
    }
  },
};
