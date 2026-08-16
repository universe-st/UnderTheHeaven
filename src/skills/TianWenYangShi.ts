import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { cardScoreBoostKey } from '../models/Card';

/**
 * 田文「养士」：你获得牌权时，令所有手牌分数+1。
 *
 * - 时机 ON_GAIN_TURN（获得牌权时，与赵高「指鹿」/张良「运筹」同时机）；
 *   开局先手、敌方不出/无牌可出后玩家获得牌权均触发。
 * - 执行：对当前所有手牌 `card.score += 1`——直接修改卡牌对象本身，**永久生效**：
 *   打出/弃置进入牌库（或弃牌堆洗回）后分数保留，摸回时仍是加成后的分数。
 *   同时按卡牌身份键（cardScoreBoostKey）累加 `battle.player.scoreBoosts`，
 *   战斗结束由 BattleFlowManager 合并写回 `run.scoreBoosts`，
 *   下场战斗 initBattle 对重建的玩家牌组重新应用（跨对局继承）。
 * - 卡面不显示分数，玩家可通过长按手牌信息窗查看当前分数。
 */
export const TianWenYangShi: SkillDefinition = {
  id: 'tianwen_yangshi',
  name: '养士',
  description: '你获得牌权时，令所有手牌分数+1',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: [
    '食客三千，皆可为我所用！',
    '孟尝君门下，岂无鸡鸣狗盗之才？',
    '养士千日，用在一时。',
  ],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('tianwen')) return false;
    // 仅玩家获得牌权时触发（排除敌方获得牌权的 ON_GAIN_TURN，与赵高「指鹿」一致）
    if (ctx.sourceCharacterId === ctx.enemyCharacterId) return false;
    return ctx.battle.player.hand.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.player.hand;
    if (hand.length === 0) return;

    visuals.playSkillTriggerSound();

    // 战斗内累计（结算时写回对局存档，实现跨对局继承）
    const boosts = (ctx.battle.player.scoreBoosts ??= {});
    for (const card of hand) {
      card.score += 1;
      const key = cardScoreBoostKey(card);
      boosts[key] = (boosts[key] ?? 0) + 1;
    }

    // 分数数据已更新；卡面不显示分数，长按手牌信息窗可查。
    // 重建手牌渲染以保持数据与显示一致（宿主场景提供 renderPlayerHand）。
    (ctx.gameScene as unknown as { renderPlayerHand?: () => void }).renderPlayerHand?.();
  },
};
