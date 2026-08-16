import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { HandSelectEvent } from './HandSelect';
import { drawCardsToHand, discardCardsFromHand } from '../utils/CardActions';

/**
 * 东方朔「讽谏」：你获得牌权时，摸一张牌并弃置一张不同的牌。
 *
 * - 时机 ON_GAIN_TURN（获得牌权时，与张良「运筹」/赵高「指鹿」同时机）。
 * - 仅玩家获得牌权时触发（filter 排除敌方获得牌权的 ON_GAIN_TURN）。
 * - 摸一张：drawCardsToHand 自动处理牌堆不足时重洗弃牌堆；
 * - 弃一张「不同的牌」（≠ 刚摸的那张）：经由公共事件「选择手牌」交互选 1 张，
 *   确认后 discardCardsFromHand 弃置；若手牌除刚摸那张外无其他牌 → 仅摸牌、自动跳过弃置。
 */
export const DongfangShuoFengJian: SkillDefinition = {
  id: 'dongfangshuo_fengjian',
  name: '讽谏',
  description: '你获得牌权时，摸一张牌并弃置一张不同的牌',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: [
    '讽一劝百，陛下明察。',
    '东方朔在此，敢言直谏。',
    '直言如药，苦口利行。',
  ],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('dongfangshuo')) return false;
    // 仅玩家获得牌权时触发（排除敌方获得牌权的 ON_GAIN_TURN，与张良「运筹」/赵高「指鹿」一致）
    if (ctx.sourceCharacterId === ctx.enemyCharacterId) return false;
    // 有牌可摸：牌堆或弃牌堆至少一处有牌（drawCardsToHand 会重洗弃牌堆）
    return ctx.battle.player.deck.length > 0 || ctx.battle.player.discardPile.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();

    // 1) 摸一张牌（牌堆顶，牌堆不足时按现有规则先补：重洗弃牌堆）
    const drawn = await drawCardsToHand(ctx.gameScene, 'player', 1);
    if (drawn.length === 0) return;
    const drawnUid = drawn[0]!.uid;

    // 2) 弃置一张「不同的牌」（≠ 刚摸的那张）
    const hand = ctx.battle.player.hand;
    const otherIndices = hand
      .map((c, i) => ({ c, i }))
      .filter(x => x.c.uid !== drawnUid)
      .map(x => x.i);
    // 手牌除刚摸那张外无其他牌 → 仅摸牌、自动跳过弃置（不卡死）
    if (otherIndices.length === 0) return;

    const chosen = await (ctx.gameScene as Phaser.Scene & HandSelectEvent).selectHandCards({
      side: 'player',
      want: (sel) => sel.length === 1,
      filter: (c) => c.uid !== drawnUid,
      forced: false,
      title: '讽谏 · 选择一张牌弃置',
    });
    if (chosen?.length !== 1) return;

    const idx = hand.findIndex(c => c.uid === chosen[0]!.uid);
    if (idx < 0) return;

    await discardCardsFromHand(ctx.gameScene, 'player', [idx]);
  },
};
