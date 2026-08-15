import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { createPokerCardVisual } from '../utils/CardVisual';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';

/**
 * 庄周「逍遥」：敌方对你结算伤害时，你进行一次判定，若结果为黑色，伤害无效。
 *
 * - 时机 ON_COEFFICIENT_REVEALED：敌方对你结算伤害（ctx.target === 'player'）时，
 *   在系数揭示后、扣血前进行**一次**判定（不用 ON_SINGLE_CARD_SETTLEMENT——
 *   那是逐张牌触发的，敌方打出多张牌会判定多次，违背"进行一次判定"）。
 * - 判定机制：从己方牌库随机抽出一张牌亮出（明置展示），按照牌的信息结算后续结果；
 *   判定后牌放进己方弃牌堆。
 * - 黑色（黑桃/梅花）→ 令本次伤害无效（cancelDamageSettlement(false)：**仅无效伤害，不获得牌权**；
 *   与张飞「断喝」不同——张飞描述明确「你获得牌权」，故传 true）；
 *   红色（红桃/方片）或王（suit 为 null）→ 伤害照常。
 * - 判定牌是"临时亮出展示"：在屏幕中央用容器绘制（参照周处「除害」drawCardFace），
 *   不进入中央牌区（不 push 进 ctx.centerCardContainers）。
 */
export const ZhuangZhouXiaoYao: SkillDefinition = {
  id: 'zhuangzhou_xiaoyao',
  name: '逍遥',
  description: '敌方对你结算伤害时，你进行一次判定，若结果为黑色，伤害无效',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 100,
  dialogLines: ['北冥有鱼，其名为鲲。', '天地与我并生，万物与我为一。', '逍遥游于天地之间。'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (!ctx.playerCharacterIds.includes('zhuangzhou')) return false;
    // 牌库有牌才能判定；牌库为空时不触发，伤害照常结算
    return ctx.battle.player.deck.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const deck = ctx.battle.player.deck;
    if (deck.length === 0) return;

    visuals.playSkillTriggerSound();
    await waitForDelay(ctx.gameScene, 100);

    // 从己方牌库随机取一张（deck 是数组，随机索引 splice 出）
    const idx = Math.floor(Math.random() * deck.length);
    const [judgedCard] = deck.splice(idx, 1);
    if (!judgedCard) return;

    // 亮出展示：屏幕中央容器绘制牌面，缩放飞入 → 停留 → 淡出销毁
    await showJudgedCard(ctx.gameScene, judgedCard);

    // 判定后牌放进己方弃牌堆
    ctx.battle.player.discardPile.push(judgedCard);

    // 黑色（黑桃/梅花）→ 伤害无效（仅取消伤害，不获得牌权——与张飞「断喝」不同）
    if (judgedCard.suit === 'spade' || judgedCard.suit === 'club') {
      visuals.cancelDamageSettlement(false);
      await showNotice(ctx.gameScene, '逍遥：判定黑色，伤害无效！');
    } else {
      // 红色（红桃/方片）或王（suit null）→ 伤害照常
      await showNotice(ctx.gameScene, '逍遥：判定为红，伤害照常', '#e8a040');
    }
  },
};

/** 屏幕中央亮出一张判定牌（缩放飞入 → 停留 1200ms → 淡出销毁），仅预览不进入中央牌区 */
async function showJudgedCard(scene: Phaser.Scene, card: Card): Promise<void> {
  const { width, height } = scene.scale;
  const overlay = scene.add.container(width / 2, height / 2).setDepth(999).setAlpha(0);

  const label = scene.add.text(0, -CARD_H / 2 - 34, '判 定', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#ffd700',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5);
  overlay.add(label);

  // 使用与手牌区完全相同的卡面样式（createPokerCardVisual）
  const cc = createPokerCardVisual(scene, card, 0, 0);
  overlay.add(cc);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.3, to: 1 },
    scaleY: { from: 0.3, to: 1 },
    duration: 400,
    ease: 'Back.easeOut',
  });

  await waitForDelay(scene, 1200);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    y: overlay.y - 60,
    duration: 300,
    ease: 'Sine.easeIn',
    onComplete: () => overlay.destroy(),
  });
}

/** 屏幕中部提示文字（浮现 → 停留 → 上浮淡出） */
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
