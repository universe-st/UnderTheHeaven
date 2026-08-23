import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import type { Card } from '../models/Card';
import { animateCoefficientUpdate } from '../utils/AnimationUtils';

/**
 * 强盗「剪径」：伤害系数+1；若你击败对方，随机抢夺其牌库中三张牌。
 *
 * - 系数+1：ON_COEFFICIENT_REVEALED 时触发（强盗对玩家结算伤害，target === 'player'），
 *   将伤害系数 +1 并同步重算 finalDamage（公式 sumRanks × coefficient × damageMultiplier）。
 * - 击败抢夺：战败结算（BattleFlowManager.showRunModeResult 失败分支）中调用
 *   plunderRandomCardsFromPool()，从玩家牌库（run.cardPool）随机移除三张牌（永久失去，
 *   不会在后续发牌中出现）。玩家牌库不足三张则全部抢走；玩家击败强盗则无事发生。
 */
export const QiangdaoJianJing: SkillDefinition = {
  id: 'qiangdao_jianjing',
  name: '剪径',
  description: '伤害系数+1；若你击败对方，随机抢夺其牌库中三张牌',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 100,
  dialogLines: ['此路是我开，此树是我栽！', '留下买路财！', '杀人越货，无本万利！'],

  filter: (ctx: SkillContext): boolean => {
    // 强盗结算对玩家造成的伤害时触发（target = 受伤方 = player）
    if (ctx.target !== 'player') return false;
    return ctx.damageInfo !== undefined;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const { damageInfo, coefficientLabel, pattern } = ctx;
    if (!damageInfo) return;

    const oldCoeff = damageInfo.coefficient;
    const newCoeff = oldCoeff + 1;
    damageInfo.coefficient = newCoeff;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * newCoeff * damageInfo.damageMultiplier,
    );

    visuals.playSkillTriggerSound();

    if (coefficientLabel && pattern) {
      await animateCoefficientUpdate(
        visuals.getScene(),
        coefficientLabel,
        HAND_TYPE_LABELS[pattern.type],
        oldCoeff,
        newCoeff,
        800,
      );
    }
  },
};

/**
 * 强盗「剪径」击败对方后的牌库抢夺：从牌库（run.cardPool）随机移除至多 count 张牌，
 * 直接 splice 原数组（永久失去），返回被移除的牌。
 */
export function plunderRandomCardsFromPool(cardPool: Card[], count: number): Card[] {
  const removed: Card[] = [];
  for (let i = 0; i < count && cardPool.length > 0; i++) {
    const idx = Math.floor(Math.random() * cardPool.length);
    removed.push(cardPool.splice(idx, 1)[0]!);
  }
  return removed;
}
