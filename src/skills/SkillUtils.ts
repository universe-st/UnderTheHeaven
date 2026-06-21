import type { SkillContext, SkillVisualManager } from './SkillTypes';
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
