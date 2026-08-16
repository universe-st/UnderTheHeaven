import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';

/**
 * 程咬金「猛斧」：你结算卡牌伤害时，前三张牌的结算伤害+25。
 *
 * - 时机 ON_SINGLE_CARD_SETTLEMENT（单牌逐张结算），只作用于玩家打出的牌
 *   （target === 'enemy'，敌方结算伤害时 target === 'player' 不触发）；
 * - 以 singleCard.index（0 起，由 DamageSettlementManager 逐牌填充）判断
 *   是否为本次伤害结算的前三张牌；
 * - 使用公共 `modifyCardDamage`（scoreBonus +25 + 计数器动画）。
 */
export const ChengYaoJinMengFu: SkillDefinition = {
  id: 'chengyaojin_mengfu',
  name: '猛斧',
  description: '你结算卡牌伤害时，前三张牌的结算伤害+25',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 100,
  dialogLines: ['三板斧，无人能挡！', '劈天裂地！', '俺老程的斧子可不长眼！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.playerCharacterIds.includes('chengyaojin')) return false;
    if (!ctx.singleCard) return false;
    const index = ctx.singleCard.index;
    if (index === undefined || index >= 3) return false;
    return true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await modifyCardDamage(ctx, visuals, 25);
  },
};
