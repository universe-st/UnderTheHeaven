import type { FourSeal } from '../models/FourSeal';

/**
 * 四象印战斗效果（纯逻辑，可单测）。
 * 触发时机：带印牌被打出并参与伤害结算时，各印在各自时机生效：
 *  - 青龙：单牌伤害得分计算时 +10（计入该牌 scoreBonus，见 DamageSettlementManager stage1）
 *  - 朱雀：系数亮出时 系数 +1（同时抬 baseCoefficient，保证章邯「绝守」等技能重算不丢失）
 *  - 玄武：单牌伤害结算动画完成后回复打出方等同该牌得分的气数（见 DamageSettlementManager 集成）
 *  - 白虎：单牌伤害结算后额外结算一次该牌（该牌伤害 ×2，见 DamageSettlementManager 集成）
 */

export const QINGLONG_SCORE_BONUS = 10;
export const ZHUQUE_COEFFICIENT_BONUS = 1;

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
