import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import { animateCoefficientUpdate } from '../utils/AnimationUtils';

function countRedCards(cards: { suit?: string | null }[]): number {
  let count = 0;
  for (const card of cards) {
    if (card.suit === 'heart' || card.suit === 'diamond') count++;
  }
  return count;
}

/**
 * 关羽「武圣」
 * 如果你持有牌权时主动打出的牌对方没有响应，则伤害系数+X。X为本次打出的牌中红色牌的数量。
 *
 * 触发时机：系数揭示后（ON_COEFFICIENT_REVEALED）。
 * 判定依据：battle.player.pendingRedCount —— BattleFlowManager 在玩家主动出牌
 * （player_init 相位）时记录本次打出牌中的红牌数；跟牌或出完牌直接结算时归零，
 * 因此仅"持有牌权主动打出且对方放弃响应"的结算满足条件。
 */
export const GuanYuWuSheng: SkillDefinition = {
  id: 'guanyu_wusheng',
  name: '武圣',
  description: '如果你持有牌权时主动打出的牌对方没有响应，则伤害系数+X。X为本次打出的牌中红色牌的数量',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 10,
  dialogLines: ['义薄云天！', '过五关，斩六将！', '某家关云长在此！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.damageInfo || !ctx.pattern) return false;
    // 仅"持有牌权主动打出且对方无响应"的结算触发
    const pendingRed = ctx.battle.player.pendingRedCount ?? 0;
    if (pendingRed <= 0) return false;
    return countRedCards(ctx.pattern.cards) > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, pattern, coefficientLabel } = ctx;
    if (!damageInfo || !pattern) return;

    const redCount = countRedCards(pattern.cards);
    if (redCount <= 0) return;

    // 在现有系数上累加（不覆盖 baseCoefficient），与章邯「绝守」等
    // 先执行的系数技能（priority 5）叠加生效
    const newCoefficient = damageInfo.coefficient + redCount;

    visuals.playSkillTriggerSound();
    if (ctx.centerCardContainers && ctx.centerCardContainers.length > 0) {
      const redContainers = ctx.centerCardContainers.filter(c =>
        c.getData('suit') === 'heart' || c.getData('suit') === 'diamond',
      );
      if (redContainers.length > 0) {
        visuals.animateCardScale(redContainers, 1.35, 200);
      }
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
        damageInfo.baseCoefficient,
        newCoefficient,
        800,
      );
    }

    // 消费判定依据，防止残留影响后续结算
    ctx.battle.player.pendingRedCount = 0;
  },
};
