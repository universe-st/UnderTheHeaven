import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { waitForDelay } from '../utils/AnimationUtils';

export const LiShizhenBenCao: SkillDefinition = {
  id: 'lishizhen_bencao',
  name: '本草',
  description: '打出牌时，回复等同于本次打出的所有梅花牌分数之和的气数',
  timing: SkillTiming.ON_PLAY,
  priority: 10,
  dialogLines: ['血不可不养，卫不可不温。', '人身不过表里，气血不过虚实。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playedCards) return false;
    if (ctx.battle.player.vitality >= ctx.battle.player.vitalityMax) return false;
    const clubCards = ctx.playedCards.filter(c => c.suit === 'club');
    return clubCards.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    if (!ctx.playedCards) return;

    const clubCards = ctx.playedCards.filter(c => c.suit === 'club');
    const clubRankSum = clubCards.reduce((s, c) => s + c.rank, 0);

    await waitForDelay(scene, 100);

    const clubContainers = (ctx.centerCardContainers || [])
      .filter(c => c.getData('suit') as string === 'club');
    if (clubContainers.length > 0) {
      visuals.animateCardScale(clubContainers);
    }
    visuals.showHeal('player', clubRankSum);
  },
};
