import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';

const XU_DA = 'xuda';

/**
 * 徐达「镇北」：你响应对方打出的牌后，对方无法再响应。
 *
 * - 时机 ON_PLAY：玩家打出牌时触发；filter 限定必须为响应（跟牌）出牌
 *   （ctx.isRespond === true），先手主动出牌不触发。
 * - 执行：置 battle.xudaResponseBlock = true，随后本圈内敌方响应路径
 *   （BattleFlowManager.aiRespond）检测到该标志直接走 pass 流程；
 *   玩家获得牌权（emitPlayerGainTurn）时清除，下一圈对方恢复正常响应。
 * - 拦截与清除均在 BattleFlowManager（集成行为），本技能只负责置标记字段。
 */
export const XuDaZhenBei: SkillDefinition = {
  id: 'xuda_zhenbei',
  name: '镇北',
  description: '你响应对方打出的牌后，对方无法再响应',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['镇北安边，谁敢来犯！', '驱除胡虏，恢复中华！', '临阵无惧，镇守如山。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(XU_DA)) return false;
    if (ctx.target !== 'enemy') return false;
    // 必须为响应（跟牌）出牌：先手主动出牌不触发
    return ctx.isRespond === true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    ctx.battle.xudaResponseBlock = true;
    visuals.playSkillTriggerSound();
  },
};
