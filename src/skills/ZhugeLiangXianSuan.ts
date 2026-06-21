import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { AudioManager } from '../utils/AudioManager';

interface GameSceneAccess {
  battle: {
    enemy: { hand: Card[] };
  };
  revealedEnemyCards: Set<Card>;
  renderEnemyHand: (animateEntry?: boolean, baseDelay?: number, onComplete?: () => void) => void;
}

export const ZhugeLiangXianSuan: SkillDefinition = {
  id: 'zhugeliang_xiansuan',
  name: '先算',
  description: '对方摸满手牌后，你随机令对方七张牌变成【明置】状态',
  timing: SkillTiming.ON_GAIN_TURN,
  dialogLines: ['算尽天下何须问，先机一步自得之。', '天机已泄，尔等休想瞒我！'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('zhugeliang')) return false;
    return ctx.battle.enemy.hand.length >= 7;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const gs = ctx.gameScene as unknown as GameSceneAccess;
    const hand = ctx.battle.enemy.hand;
    const count = Math.min(7, hand.length);

    const indices = Array.from({ length: hand.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    gs.revealedEnemyCards.clear();
    for (let i = 0; i < count; i++) {
      gs.revealedEnemyCards.add(hand[indices[i]]);
    }

    visuals.playSkillTriggerSound();
    AudioManager.playSfx(ctx.gameScene, 'sfx_card_reveal');
  },
};
