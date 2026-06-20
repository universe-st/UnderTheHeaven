import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { countSuits } from '../engine/CharacterAbilities';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import { waitForDelay, animateCoefficientUpdate } from '../utils/AnimationUtils';

export const HanxinDianBing: SkillDefinition = {
  id: 'hanxin_dianbing',
  name: '点兵',
  description: '伤害结算时，系数乘以打出牌的花色数（至少为一）',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 10,
  dialogLines: ['多多益善！', '战无不胜，攻无不克！'],

  filter: (ctx: SkillContext): boolean => {
    return ctx.target === 'enemy'
      && ctx.damageInfo !== undefined
      && ctx.centerCardContainers !== undefined
      && ctx.centerCardContainers.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, centerCardContainers, coefficientLabel } = ctx;
    if (!damageInfo || !centerCardContainers) return;

    const suitCount = countSuits(ctx.pattern!.cards);
    if (suitCount <= 1) return;

    const baseCoefficient = damageInfo.baseCoefficient;
    const newCoefficient = baseCoefficient * suitCount;

    visuals.playSkillTriggerSound();

    const seenSuits = new Set<string>();
    const cardsToAnimate: Phaser.GameObjects.Container[] = [];
    for (const card of centerCardContainers) {
      const suit = card.getData('suit') as string | undefined;
      if (suit && !seenSuits.has(suit)) {
        seenSuits.add(suit);
        cardsToAnimate.push(card);
      }
    }
    if (cardsToAnimate.length > 0) {
      visuals.animateCardScale(cardsToAnimate, 1.35, 200);
    }

    damageInfo.coefficient = newCoefficient;
    damageInfo.finalDamage = Math.round(damageInfo.sumRanks * newCoefficient);

    if (coefficientLabel && ctx.pattern) {
      const typeLabel = HAND_TYPE_LABELS[ctx.pattern.type];
      await animateCoefficientUpdate(
        scene,
        coefficientLabel,
        typeLabel,
        baseCoefficient,
        newCoefficient,
        800,
      );
    }
  },
};
