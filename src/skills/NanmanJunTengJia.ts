import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
} from './SkillTypes';
import { nullifyCardDamage, multiplyCardDamage } from './SkillUtils';

export const NanmanJunTengJiaBlack: SkillDefinition = {
  id: 'nanmanjun_tengjia_black',
  name: '藤甲',
  description: '单牌伤害结算时，黑色牌不计算分数',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 20,
  dialogLines: ['刀枪不入，水火不侵！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    const suit = ctx.singleCard.card.getData('suit') as string;
    return suit === 'spade' || suit === 'club';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await nullifyCardDamage(ctx, visuals);
  },
};

export const NanmanJunTengJiaHeart: SkillDefinition = {
  id: 'nanmanjun_tengjia_heart',
  name: '藤甲',
  description: '单牌伤害结算时，红桃牌计分×3',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 10,
  dialogLines: ['藤甲护体，烈火反噬！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'heart';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await multiplyCardDamage(ctx, visuals, 3);
  },
};
