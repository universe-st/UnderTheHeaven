import type { FourSeal } from '../models/FourSeal';

/**
 * 四象印战斗效果（纯逻辑，可单测）。
 * 触发时机：带印牌被玩家打出并参与伤害结算时。
 *  - 青龙：计算伤害得分 +10（sumRanks，参与系数乘法）
 *  - 朱雀：牌型系数 +1（同时抬 baseCoefficient，保证章邯「绝守」等技能重算不丢失）
 *  - 玄武：回复等同得分的气数（见 DamageSettlementManager 集成）
 *  - 白虎：伤害数字结算两次（见 DamageSettlementManager 集成，每手最多一次）
 */

export const QINGLONG_SCORE_BONUS = 10;
export const ZHUQUE_COEFFICIENT_BONUS = 1;

/** 结算链路的伤害信息子集（DamageSettlementManager.damageInfo 结构兼容） */
export interface SealDamageInfo {
  sumRanks: number;
  baseCoefficient: number;
  coefficient: number;
}

/** 收集一手牌中带有的全部四印（含重复） */
export function collectSeals(cards: readonly { seal?: FourSeal }[]): FourSeal[] {
  const seals: FourSeal[] = [];
  for (const c of cards) {
    if (c.seal) {
      seals.push(c.seal);
    }
  }
  return seals;
}

export function countSeal(seals: readonly FourSeal[], seal: FourSeal): number {
  let n = 0;
  for (const s of seals) {
    if (s === seal) n += 1;
  }
  return n;
}

/**
 * 应用青龙/朱雀的数值加成（就地修改 info）。
 * 青龙每张 +10 得分；朱雀每张 系数 +1（baseCoefficient 同步抬升）。
 */
export function applySealBonuses(info: SealDamageInfo, seals: readonly FourSeal[]): void {
  const qinglong = countSeal(seals, 'qinglong');
  const zhuque = countSeal(seals, 'zhuque');
  if (qinglong > 0) {
    info.sumRanks += QINGLONG_SCORE_BONUS * qinglong;
  }
  if (zhuque > 0) {
    const bonus = ZHUQUE_COEFFICIENT_BONUS * zhuque;
    info.baseCoefficient += bonus;
    info.coefficient += bonus;
  }
}

/** 是否含白虎印（每手最多触发一次二次结算） */
export function hasBaihu(seals: readonly FourSeal[]): boolean {
  return seals.includes('baihu');
}

/** 是否含玄武印 */
export function hasXuanwu(seals: readonly FourSeal[]): boolean {
  return seals.includes('xuanwu');
}
