import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';
import { countSuits } from '../engine/CharacterAbilities';

/**
 * 花木兰「从军」：你打出的牌若包含四种花色，每张牌结算伤害时分数+20。
 * 四种花色齐全指 countSuits(pattern.cards) === 4；王（suit 为 null）不参与统计。
 */
export const HuaMulanCongJun: SkillDefinition = {
  id: 'huamulan_congjun',
  name: '从军',
  description: '你打出的牌若包含四种花色，每张牌结算伤害时分数+20',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['愿为市鞍马，从此替爷征！', '谁说女子不如男！', '万里赴戎机，关山度若飞。'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    if (!ctx.pattern) return false;
    return countSuits(ctx.pattern.cards) === 4;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await modifyCardDamage(ctx, visuals, 20);
  },
};
