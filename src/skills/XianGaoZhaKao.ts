import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { HandSelectEvent } from './HandSelect';
import type { Card } from '../models/Card';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';
import { waitForDelay } from '../utils/AnimationUtils';

/**
 * 弦高「诈犒」：你即将受到对方的卡牌伤害时，你可以将等量的黑色牌交给对方，
 * 不进行伤害结算，随后你获得牌权。
 *
 * - 时机 ON_COEFFICIENT_REVEALED：敌方对你结算伤害、系数揭示后、扣血前触发一次
 *   （该时机 cancelDamageSettlement 可阻止伤害——对应「即将受到伤害时」）。
 * - 等量 = 与敌方本次打出的牌张数相等（ctx.pattern.cards.length）。
 * - 黑色 = suit === 'spade' || suit === 'club'；王（suit 为 null）不是黑色，自动排除。
 * - 「可以」= 玩家可选发动：阻塞式交互 selectHandCards（forced: false 可取消）。
 *   选够 N 张黑色牌 → discardCardsFromHand(skipDiscardPile: true) 从玩家手牌移除，
 *   再 addCardsToHand('enemy') 交给敌方（剪径范式，不进入玩家弃牌堆），
 *   随后 cancelDamageSettlement(true)（不进行伤害结算 + 玩家获得牌权）。
 * - 玩家取消 → 直接 return，伤害照常结算，不交牌、不取消。
 */
export const XianGaoZhaKao: SkillDefinition = {
  id: 'xiangao_zhakao',
  name: '诈犒',
  description: '你即将受到对方的卡牌伤害时，你可以将等量的黑色牌交给对方，不进行伤害结算，随后你获得牌权',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 100,
  dialogLines: [
    '以十二牛犒秦师，聊表郑国诚意！',
    '将军远道而来，弦高特奉牛酒犒劳。',
    '兵临城下，亦可智退万军。',
  ],

  filter: (ctx: SkillContext): boolean => {
    // a) 敌方打出的牌正对玩家结算
    if (ctx.target !== 'player') return false;
    // b) 弦高在玩家阵容中
    if (!ctx.playerCharacterIds.includes('xiangao')) return false;
    // c) 需要敌方本次出牌的张数（等量 = 张数相等）
    if (!ctx.pattern || !ctx.pattern.cards || ctx.pattern.cards.length === 0) return false;
    // d) 玩家手牌中黑色牌数量 >= 敌方本次出牌张数
    //    黑色 = 黑桃/梅花；王（suit null）不是黑色，自动排除
    const blackCount = ctx.battle.player.hand.filter(
      c => c.suit === 'spade' || c.suit === 'club',
    ).length;
    return blackCount >= ctx.pattern.cards.length;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const pattern = ctx.pattern;
    if (!pattern || pattern.cards.length === 0) return;

    // b) 等量 N = 敌方本次打出的牌张数
    const N = pattern.cards.length;

    visuals.playSkillTriggerSound();
    await waitForDelay(ctx.gameScene, 100);

    // c) 阻塞式交互确认（「可以」= 可选发动，参照东方朔「讽谏」）
    const chosen = await (ctx.gameScene as Phaser.Scene & HandSelectEvent).selectHandCards({
      side: 'player',
      want: (sel) => sel.length === N,
      filter: (c) => c.suit === 'spade' || c.suit === 'club',
      forced: false,
      title: `诈犒 · 交出 ${N} 张黑色牌，免伤并获得牌权（可取消）`,
    });

    // f) 玩家取消（chosen 为 null）→ 不交牌、不取消，伤害照常结算
    if (!chosen || chosen.length !== N) return;

    // d) 按 uid 在玩家手牌中找到这些牌的索引，一次性移除（skipDiscardPile 保证不进玩家弃牌堆）
    const hand = ctx.battle.player.hand;
    const chosenUids = new Set(chosen.map(c => c.uid));
    const indices = hand
      .map((c, i) => ({ c, i }))
      .filter(x => chosenUids.has(x.c.uid))
      .map(x => x.i);
    if (indices.length !== N) return;

    const removed = await discardCardsFromHand(ctx.gameScene, 'player', indices, {
      skipDiscardPile: true,
    });
    if (removed.length === 0) return;

    // e) 交给敌方（剪径范式）
    await addCardsToHand(ctx.gameScene, 'enemy', removed);

    // 不进行伤害结算 + 玩家获得牌权（同张飞「断喝」/荆轲「匕现」）
    visuals.cancelDamageSettlement(true);
  },
};
