import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';
import { pickLargestCardIndex, rollTempCard } from './ZhaoGaoZhiLuLogic';

export const ZhaoGaoZhiLu: SkillDefinition = {
  id: 'zhaogao_zhilu',
  name: '指鹿',
  description: '你获得牌权时，随机失去一张最大的牌，生成随机花色点数且点数不大于失去牌的临时牌',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: ['指鹿为马，孰敢言非！', '满朝文武，皆听我言！'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('zhaogao')) return false;
    // 仅玩家获得牌权时触发（排除敌方获得牌权的 ON_GAIN_TURN）
    if (ctx.sourceCharacterId === ctx.enemyCharacterId) return false;
    return ctx.battle.player.hand.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.player.hand;
    if (hand.length === 0) return;

    const idx = pickLargestCardIndex(hand);
    visuals.playSkillTriggerSound();

    // 失去：移出游戏（不进弃牌堆），与「弃置」相区别
    const [lostCard] = await discardCardsFromHand(ctx.gameScene, 'player', [idx], {
      skipDiscardPile: true,
    });
    if (!lostCard) return;

    const tempCard = rollTempCard(lostCard);
    if (tempCard) {
      await addCardsToHand(ctx.gameScene, 'player', [tempCard]);
    }
  },
};
