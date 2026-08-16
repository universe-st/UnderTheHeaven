import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import { animateCoefficientUpdate } from '../utils/AnimationUtils';

/**
 * 苏秦「合纵」：若你打出的牌中所有牌均有点数且不大于6，系数+X（X为本次打出的牌数）。
 *
 * - 时机 ON_COEFFICIENT_REVEALED：玩家造成伤害结算、系数揭示后（同章邯「绝守」）。
 * - 条件：本次打出的所有牌点数 ≤ 6（王 rank 25/30 天然被排除，即「均有点数」）。
 * - 加成：在现有系数上直接相加 +X（X = 牌数），不基于 baseCoefficient 重算，
 *   避免覆盖章邯「绝守」等先执行的系数加成（priority 60 晚于绝守的 5）。
 * - 同步重算 finalDamage：round(sumRanks × 新系数 × damageMultiplier)。
 */
export const SuQinHeZong: SkillDefinition = {
  id: 'suqin_hezong',
  name: '合纵',
  description: '若你打出的牌中所有牌均有点数且不大于6，系数+X（X为本次打出的牌数）',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 60,
  dialogLines: ['合纵连横，天下之势！', '六国同心，可拒强秦！', '凭三寸之舌，说六国之君！'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('suqin')) return false;
    if (ctx.target !== 'enemy') return false;
    if (!ctx.damageInfo || !ctx.pattern) return false;
    const cards = ctx.pattern.cards;
    if (cards.length === 0) return false;
    // 所有牌均有点数且不大于6：点数 3~6；王（rank 25/30）没有点数，天然不满足
    return cards.every(c => c.rank <= 6);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, coefficientLabel, pattern } = ctx;
    if (!damageInfo || !pattern) return;

    const X = pattern.cards.length;
    const oldCoefficient = damageInfo.coefficient;
    const newCoefficient = oldCoefficient + X;

    visuals.playSkillTriggerSound();
    // 本次所有牌放大强调（合纵生效的牌组）
    if (ctx.centerCardContainers && ctx.centerCardContainers.length > 0) {
      visuals.animateCardScale(ctx.centerCardContainers, 1.35, 200);
    }

    damageInfo.coefficient = newCoefficient;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * newCoefficient * (damageInfo.damageMultiplier ?? 1),
    );

    if (coefficientLabel) {
      const typeLabel = HAND_TYPE_LABELS[pattern.type];
      await animateCoefficientUpdate(
        scene,
        coefficientLabel,
        typeLabel,
        oldCoefficient,
        newCoefficient,
        800,
      );
    }
  },
};
