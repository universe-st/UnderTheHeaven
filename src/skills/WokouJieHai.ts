import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';

export const WokouJieHai: SkillDefinition = {
  id: 'wokou_jiehai',
  name: '劫海',
  description: '获得牌权时，若对方手牌数不大于三张，获得这些牌；被击败后，这些牌回归对方牌库',
  timing: SkillTiming.ON_TURN_START,
  priority: 100,
  dialogLines: ['此海此船，皆归我有！', '把牌留下，饶你不死！'],

  // 与黄巾军「黄天」同一时机：ON_TURN_START 只在敌方 aiInitiatePlay（敌方回合开始/获得牌权）时 emit，
  // 天然是敌方侧；「对方」即玩家，牌数不大于三张即 ≤3 且非空。
  filter: (ctx: SkillContext): boolean => {
    const playerHand = ctx.battle.player.hand;
    return playerHand.length > 0 && playerHand.length <= 3;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const playerHand = ctx.battle.player.hand;
    if (playerHand.length === 0 || playerHand.length > 3) return;

    visuals.playSkillTriggerSound();

    // 将玩家手牌全部移出（skipDiscardPile 保证不进入玩家弃牌堆），加入敌方手牌
    const indices = playerHand.map((_, i) => i);
    const stolen = await discardCardsFromHand(ctx.gameScene, 'player', indices, {
      skipDiscardPile: true,
    });
    if (stolen.length === 0) return;

    await addCardsToHand(ctx.gameScene, 'enemy', stolen);

    // 深拷贝记录劫海牌：战斗结束敌方被击败（玩家胜利）后，这些牌无条件回归玩家牌库
    if (!ctx.battle.wokouStolenCards) {
      ctx.battle.wokouStolenCards = [];
    }
    ctx.battle.wokouStolenCards.push(...stolen.map(c => ({ ...c })));
  },
};
