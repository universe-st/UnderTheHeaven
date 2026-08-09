import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { addCardsToHand } from '../utils/CardActions';
import { waitForDelay } from '../utils/AnimationUtils';

/**
 * 李清照「幽怨」：若你打出的牌均为黑色且不小于五张，结算后将点数最大的牌收回手牌。
 *
 * - 黑色 = suit 为 'spade'（黑桃）或 'club'（梅花）；王（suit 为 null）不满足"均为黑色"，自动排除。
 * - 时机 AFTER_DAMAGE：伤害结算完成后触发，此时打出牌已进入玩家弃牌堆。
 * - 收回规则：从打出牌中找点数（rank）最大的牌；若多张并列最大点数（如两张 K），全部收回。
 * - uid 系统（4.27）：pattern.cards 与 ctx.battle.player.discardPile 中的牌是不同引用但 uid 相同，
 *   必须按 uid 从弃牌堆中移除后再收回，禁止直接 addCardsToHand(pattern.cards 原引用) 造成复制牌。
 */
export const LiQingZhaoYouYuan: SkillDefinition = {
  id: 'liqingzhao_youyuan',
  name: '幽怨',
  description: '若你打出的牌均为黑色且不小于五张，结算后将点数最大的牌收回手牌',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 100,
  dialogLines: ['寻寻觅觅，冷冷清清，凄凄惨惨戚戚。', '此情无计可消除，才下眉头，却上心头。', '雁字回时，月满西楼。'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.pattern) return false;
    if (ctx.pattern.cards.length < 5) return false;
    // 王（suit 为 null）不满足 spade/club，every 自动返回 false
    return ctx.pattern.cards.every((c) => c.suit === 'spade' || c.suit === 'club');
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const pattern = ctx.pattern;
    if (!pattern) return;

    // 找最大点数；多张并列最大点数时全部收回
    let maxRank = 0;
    for (const c of pattern.cards) {
      if (c.rank > maxRank) maxRank = c.rank;
    }
    const maxRankUids = new Set(
      pattern.cards.filter((c) => c.rank === maxRank).map((c) => c.uid),
    );

    visuals.playSkillTriggerSound();
    await waitForDelay(ctx.gameScene, 300);

    // 按 uid 从玩家弃牌堆中移除（pattern.cards 与 discardPile 中为不同引用、uid 相同）
    const discardPile = ctx.battle.player.discardPile;
    const reclaimed: Card[] = [];
    for (let i = discardPile.length - 1; i >= 0; i--) {
      const card = discardPile[i]!;
      if (maxRankUids.has(card.uid)) {
        discardPile.splice(i, 1);
        reclaimed.push(card);
      }
    }

    if (reclaimed.length > 0) {
      // addCardsToHand 内部自带飞入手牌动画
      await addCardsToHand(ctx.gameScene, 'player', reclaimed);
    }
  },
};
