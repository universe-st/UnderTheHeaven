import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';

/**
 * 戚继光「荡寇」：若你打出的牌数量超出对方手牌数，结算伤害时所有牌额外结算一次。
 *
 * - 时机 ON_SINGLE_CARD_SETTLEMENT：单牌逐张结算时，"所有牌额外结算一次" =
 *   该张牌计分翻倍，即 scoreBonus += baseScore，最终计分 = 2 × baseScore。
 * - 与李清照「豪放」同构（按"牌数 > 对方手牌数"整体判定，非单花色加成，
 *   不使用 createSuitScoreBonusSkill 工厂）。
 */
export const QiJiGuangDangKou: SkillDefinition = {
  id: 'qijiguang_dangkou',
  name: '荡寇',
  description: '若你打出的牌数量超出对方手牌数，结算伤害时所有牌额外结算一次',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 8,
  dialogLines: ['封侯非我意，但愿海波平！', '倭寇不灭，何以家为？', '威震海疆，荡平贼寇！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    if (!ctx.pattern) return false;
    // 打出牌数量超出对方手牌数（"超出" = 严格大于）
    return ctx.pattern.cards.length > ctx.battle.enemy.hand.length;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const baseScore = ctx.singleCard?.baseScore;
    if (baseScore === undefined) return;
    // 额外结算一次 = 计分翻倍：scoreBonus += baseScore，最终计分 2 × baseScore
    await modifyCardDamage(ctx, visuals, baseScore);
  },
};
