import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { countSuits } from '../engine/CharacterAbilities';
import { animateMultiplierUpdate } from '../utils/AnimationUtils';

export const HanxinDianBing: SkillDefinition = {
  id: 'hanxin_dianbing',
  name: '点兵',
  description: '你打出牌的伤害倍数+X，X为打出牌的花色数',
  timing: SkillTiming.ON_DAMAGE_MULTIPLIER_REVEALED,
  priority: 10,
  dialogLines: ['多多益善！', '战无不胜，攻无不克！'],

  filter: (ctx: SkillContext): boolean => {
    return ctx.target === 'enemy'
      && ctx.damageInfo !== undefined
      && ctx.centerCardContainers !== undefined
      && ctx.centerCardContainers.length > 0
      && ctx.pattern !== undefined
      && countSuits(ctx.pattern.cards) > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, centerCardContainers, multiplierLabel, pattern } = ctx;
    if (!damageInfo || !centerCardContainers || !pattern) return;

    const suitCount = countSuits(pattern.cards);
    if (suitCount === 0) return;

    const oldMultiplier = damageInfo.damageMultiplier;
    const newMultiplier = oldMultiplier + suitCount;

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

    damageInfo.damageMultiplier = newMultiplier;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * damageInfo.coefficient * newMultiplier,
    );

    if (multiplierLabel) {
      await animateMultiplierUpdate(
        scene,
        multiplierLabel,
        oldMultiplier,
        newMultiplier,
        800,
      );
    }
  },
};