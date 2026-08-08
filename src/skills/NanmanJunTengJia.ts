import {
  SkillTiming,
  type SkillDefinition,
  type SkillContext,
  type SkillVisualManager,
  type AIDecisionHook,
} from './SkillTypes';
import { nullifyCardDamage, multiplyCardDamage } from './SkillUtils';

const nanmanjunOnAIDecision: AIDecisionHook = (plays, ctx) => {
  // 花色偏好（风格化：南蛮军喜黑避红）只影响「出哪张」，绝不应压过「要不要接」。
  // 接牌（isFollow）时红桃不惩罚：放弃接牌会白白损失牌权，即使接牌伤害低也是正收益。
  // 主动出牌时惩罚也温和化（±3），避免顺子等复合牌型按张数放大导致评分失真。
  for (const p of plays) {
    for (const card of p.play.cards) {
      if (card.suit === 'spade' || card.suit === 'club') p.score += ctx.isFollow ? 1 : 3;
      if (card.suit === 'heart') p.score -= ctx.isFollow ? 0 : 3;
    }
  }
};

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

  onAIDecision: nanmanjunOnAIDecision,
};

export const NanmanJunTengJiaHeart: SkillDefinition = {
  id: 'nanmanjun_tengjia_heart',
  name: '藤甲',
  description: '单牌伤害结算时，红桃牌计分×3',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 10,
  dialogLines: ['藤甲护体，烈火反噬！'],
  // AI onAIDecision 在 NanmanJunTengJiaBlack 上定义，此处无需重复

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.singleCard.card.getData('suit') as string) === 'heart';
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await multiplyCardDamage(ctx, visuals, 3);
  },
};
