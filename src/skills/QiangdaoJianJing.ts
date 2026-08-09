import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type AIDecisionHook } from './SkillTypes';
import { HandType } from '../models/BattleTypes';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';

const qiangdaoOnAIDecision: AIDecisionHook = (plays) => {
  for (const p of plays) {
    if (p.play.type === HandType.Single) {
      p.score += 10;
    }
  }
};

export const QiangdaoJianJing: SkillDefinition = {
  id: 'qiangdao_jianjing',
  name: '剪径',
  description: '造成伤害后，随机获得你的一张牌',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 100,
  dialogLines: ['此路是我开，此树是我栽！', '留下买路财！'],

  // 牌库规则：被抢夺的牌以 skipDiscardPile 从玩家手牌移除、加入敌方手牌，
  // 不进入玩家弃牌堆；战斗结束时手牌/弃牌堆全部丢弃，故被抢的牌在战斗结束后
  // 永久失去，不会进入玩家牌库（run.cardPool 不变）。
  // 与周处「除害」相对：除害获得的牌会写回玩家牌库（见 BattleFlowManager 结算）。

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

  onAIDecision: qiangdaoOnAIDecision,
};
