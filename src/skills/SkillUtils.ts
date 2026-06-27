import { SkillTiming, type SkillContext, type SkillDefinition, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { waitForCounterTween } from '../utils/AnimationUtils';

export async function nullifyCardDamage(
  ctx: SkillContext,
  visuals: SkillVisualManager,
): Promise<void> {
  const sc = ctx.singleCard;
  if (!sc) return;

  sc.scoreBonus = -sc.baseScore;

  visuals.playSkillTriggerSound();

  sc.card.setAlpha(0.35);
  await waitForCounterTween(ctx.gameScene, {
    from: sc.baseScore,
    to: 0,
    duration: 400,
    ease: 'Cubic.easeOut',
    onUpdate: (val) => {
      sc.scoreText.setText(`+${Math.round(val)}`);
    },
  });
}

export async function modifyCardDamage(
  ctx: SkillContext,
  visuals: SkillVisualManager,
  bonus: number,
): Promise<void> {
  const sc = ctx.singleCard;
  if (!sc) return;

  sc.scoreBonus += bonus;

  visuals.playSkillTriggerSound();

  const targetScore = sc.baseScore + bonus;
  await waitForCounterTween(ctx.gameScene, {
    from: sc.baseScore,
    to: targetScore,
    duration: 400,
    ease: 'Cubic.easeOut',
    onUpdate: (val) => {
      sc.scoreText.setText(`+${Math.round(val)}`);
    },
  });
}

export async function multiplyCardDamage(
  ctx: SkillContext,
  visuals: SkillVisualManager,
  multiplier: number,
): Promise<void> {
  const sc = ctx.singleCard;
  if (!sc) return;

  const currentTotal = sc.baseScore + sc.scoreBonus;
  const newTotal = Math.round(currentTotal * multiplier);
  sc.scoreBonus = newTotal - sc.baseScore;

  visuals.playSkillTriggerSound();

  await waitForCounterTween(ctx.gameScene, {
    from: currentTotal,
    to: newTotal,
    duration: 400,
    ease: 'Cubic.easeOut',
    onUpdate: (val) => {
      sc.scoreText.setText(`+${Math.round(val)}`);
    },
  });
}

export function createSuitScoreBonusSkill(config: {
  id: string;
  name: string;
  description: string;
  suit: NonNullable<Card['suit']>;
  bonus: number;
  dialogLines: string[];
}): SkillDefinition {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
    priority: 8,
    dialogLines: config.dialogLines,

    filter: (ctx: SkillContext): boolean => {
      if (ctx.target !== 'enemy') return false;
      if (!ctx.singleCard) return false;
      return (ctx.singleCard.card.getData('suit') as string) === config.suit;
    },

    execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
      await modifyCardDamage(ctx, visuals, config.bonus);
    },
  };
}
