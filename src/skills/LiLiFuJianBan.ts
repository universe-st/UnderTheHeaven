import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { nullifyCardDamage } from './SkillUtils';

/**
 * 李离「伏剑」永久禁分（隐藏技）：自此之后的所有对局中，
 * 对方该花色的牌结算伤害永不计分。
 *
 * - 时机 ON_SINGLE_CARD_SETTLEMENT，target === 'player'（敌方打出对玩家结算，方向正确）；
 * - 读取 battle.permanentSuitBans（本场由「伏剑」从 RunState.permanentSuitBans 注入；
 *   GameScene.initBattle 也会从对局存档读入，保证李离移除后、后续对局仍生效）；
 * - 命中禁分花色则 nullifyCardDamage（priority 200 覆盖式归零，确保各类加分技能
 *   之后的最终分数为 0，参照周公旦「制礼」nullify 段）。
 * - 该技能挂在李离的 abilities 中（hidden），即便李离本场已移除，
 *   只要 skills 按 abilities 注册即可触发；李离不在阵容时 registerForBattle
 *   不注册，由 RunState.permanentSuitBans 注入 battle 的机制保证——详见
 *   GameScene.initBattle 的注入点。
 */
export const LiLiFuJianBan: SkillDefinition = {
  id: 'lili_fujian_ban',
  name: '伏剑',
  description: '',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  // 覆盖式归零：priority 置大（最后执行），确保在各类加分/倍率技能之后归零
  priority: 200,

  filter: (ctx: SkillContext): boolean => {
    // 只对敌方打出的牌结算（target === 'player'）生效；玩家对敌方结算不禁
    if (ctx.target !== 'player') return false;
    if (!ctx.singleCard) return false;
    const bans = ctx.battle.permanentSuitBans;
    if (!bans || bans.length === 0) return false;
    const cardSuit = ctx.singleCard.card.getData('suit') as string | undefined;
    if (!cardSuit) return false;
    return bans.includes(cardSuit as NonNullable<Card['suit']>);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await nullifyCardDamage(ctx, visuals);
  },
};
