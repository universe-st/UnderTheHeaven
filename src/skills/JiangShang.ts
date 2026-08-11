import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { cardDisplayName } from '../models/Card';
import { HandType } from '../models/BattleTypes';
import { addCardsToHand } from '../utils/CardActions';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';

/**
 * 姜尚「垂钓」：若你打出单张牌型响应后对方无法继续接应，则在伤害结算完成后，
 * 你获得这一圈对方打出的所有非临时牌，并将这些牌变成临时牌。
 *
 * - 时机 ON_ENEMY_PASS（敌方选择不出、一圈结束且伤害结算完成后）。
 * - 只获得对方打出的牌（不包含自己打出的牌）；对方打出的临时牌不获得（isTemp 过滤）；
 *   敌方出牌时已将牌 push 进 discardPile，获得前须按 uid 移出，否则洗牌会重复。
 */
export const JiangShangChuiDiao: SkillDefinition = {
  id: 'jiangshang_chuidiao',
  name: '垂钓',
  description: '若你打出单张牌型响应后对方无法继续接应，则在伤害结算完成后，你获得这一圈对方打出的所有非临时牌，并将这些牌变成临时牌',
  timing: SkillTiming.ON_ENEMY_PASS,
  priority: 100,
  dialogLines: ['渭水垂纶，愿者上钩！', '这一池鱼，皆入我彀中。', '太公在此，诸邪退避。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('jiangshang')) return false;
    // 仅单张牌型（最后接应的牌型为单张）
    if (!ctx.pattern || ctx.pattern.type !== HandType.Single) return false;
    // 这一圈对方打出过可获得的（非临时）牌
    const gained = (ctx.roundEnemyCards ?? []).filter(c => !c.isTemp);
    return gained.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const roundCards = ctx.roundEnemyCards ?? [];
    const gained = roundCards.filter(c => !c.isTemp);
    if (gained.length === 0) return;

    visuals.playSkillTriggerSound();

    // 将这些牌变成临时牌
    for (const c of gained) c.isTemp = true;

    // 从敌方弃牌堆按 uid 移除（敌方出牌时已 push 进 discardPile，必须移出防止洗牌重复）
    const uids = new Set(gained.map(c => c.uid));
    ctx.battle.enemy.discardPile = ctx.battle.enemy.discardPile.filter(c => !uids.has(c.uid));

    // 加入玩家手牌（含视觉动画与渲染）
    await addCardsToHand(ctx.gameScene, 'player', gained);

    const names = gained.map(c => cardDisplayName(c)).join('、');
    await showNotice(ctx.gameScene, `垂钓：获得对方的 ${names}`);
  },
};

/**
 * 姜尚「辅王」：你摸满手牌后，若手牌中不包含大王或3，你从己方牌堆里获得之。
 *
 * - 时机 ON_HAND_REFILLED（玩家手牌打空补满到上限）。
 * - 缺什么补什么：手牌无大王（rank 30）就从己方牌堆获得一张大王；无 3（rank 3）就获得一张 3；
 *   两者都缺则都获得。牌堆中存在才获得、各自最多一张；牌堆没有对应的牌就不补（不强造）。
 * - priority 10 高于孙膑「减灶」（默认 100），保证摸满手牌时先补大王/3 再让减灶选牌。
 */
export const JiangShangFuWang: SkillDefinition = {
  id: 'jiangshang_fuwang',
  name: '辅王',
  description: '你摸满手牌后，若手牌中不包含大王或3，你从己方牌堆里获得之',
  timing: SkillTiming.ON_HAND_REFILLED,
  priority: 10,
  dialogLines: ['文王至，天下定，自有天意。', '辅佐明主，匡扶社稷。', '此乃天赐之牌。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('jiangshang')) return false;
    const hand = ctx.battle.player.hand;
    // 手牌缺大王（rank 30）或缺 3（rank 3）即触发（缺王补王、缺3补3、都缺都补）
    return !hand.some(c => c.rank === 30) || !hand.some(c => c.rank === 3);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.player.hand;
    const deck = ctx.battle.player.deck;
    const gained: Card[] = [];

    // 独立判定、缺什么补什么：两步骤互不影响
    if (!hand.some(c => c.rank === 30)) {
      const idx = deck.findIndex(c => c.rank === 30);
      if (idx >= 0) gained.push(deck.splice(idx, 1)[0]!);
    }
    if (!hand.some(c => c.rank === 3)) {
      const idx = deck.findIndex(c => c.rank === 3);
      if (idx >= 0) gained.push(deck.splice(idx, 1)[0]!);
    }
    if (gained.length === 0) return;

    visuals.playSkillTriggerSound();

    // 加入手牌：addCardsToHand 内含 push + sortHand + 视觉动画
    await addCardsToHand(ctx.gameScene, 'player', gained);

    const names = gained.map(c => c.rankLabel).join('、');
    await showNotice(ctx.gameScene, `辅王：从牌堆获得 ${names}`);
  },
};

/** 屏幕中部提示文字（浮现 → 停留 → 上浮淡出），与张良「运筹」一致 */
async function showNotice(
  scene: Phaser.Scene,
  text: string,
  color = '#ffd700',
): Promise<void> {
  const { width, height } = scene.scale;
  const t = scene.add.text(width / 2, height / 2 + 160, text, {
    fontSize: '34px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color,
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT).setAlpha(0);

  await waitForTween(scene, { targets: t, alpha: 1, duration: 200, ease: 'Sine.easeOut' });
  await waitForDelay(scene, 900);
  await waitForTween(scene, {
    targets: t,
    alpha: 0,
    y: t.y - 40,
    duration: 300,
    ease: 'Sine.easeIn',
    onComplete: () => t.destroy(),
  });
}
