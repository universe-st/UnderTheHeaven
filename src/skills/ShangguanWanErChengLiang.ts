import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';

/**
 * 上官婉儿「称量」：你每有一个角色牌，结算伤害时每张牌分数+5。
 * 角色数 = 当前阵容角色数（playerCharacterIds.length）减去战斗中已失去的角色数
 * （battle.player.lostCharacters 与阵容的交集数量；lostCharacters 可能为 undefined）。
 */
export const ShangguanWanErChengLiang: SkillDefinition = {
  id: 'shangguanwaner_chengliang',
  name: '称量',
  description: '你每有一个角色牌，结算伤害时每张牌分数+5',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['称量天下，权衡于心！', '巾帼宰相，岂让须眉？', '昭容秉笔，断尽朝野事。'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return ctx.playerCharacterIds.includes('shangguanwaner');
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const lostCount = (ctx.battle.player.lostCharacters ?? []).filter(c =>
      ctx.playerCharacterIds.includes(c),
    ).length;
    const count = ctx.playerCharacterIds.length - lostCount;
    if (count <= 0) return;
    await modifyCardDamage(ctx, visuals, count * 5);
  },
};
