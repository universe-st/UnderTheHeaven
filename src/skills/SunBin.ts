import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { HandSelectEvent } from './HandSelect';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForTween, waitForDelay, waitForCounterTween } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';

/**
 * 孙膑「减灶」（发动）：你摸满手牌后，主动选择三张牌弃置。
 * 直到你打完手牌为止，每次你结算伤害时，额外加上这三张牌的总分数。
 *
 * - 发动时机 ON_HAND_REFILLED（玩家手牌打空补满到上限）。
 * - 交互选牌 UI：经由公共事件「选择手牌」（HandSelectEvent）在玩家手牌区
 *   点选（filter 过滤、want 满足时确认键亮），点「确定」弃置 3 张、「取消」不发动；
 *   由敌人执行时直接返回 AI 判断（弃置分数最低的 3 张），无动画。
 * - 弃置为普通弃置（进弃牌堆）；bonus = 三张牌 score 之和，写入 battle.jianzaoBonus /
 *   jianzaoActive。效果周期到玩家打光手牌（handlePostPlayEmptyHandCheck 复位 active）。
 */
export const SunBinJianZao: SkillDefinition = {
  id: 'sunbin_jianzao',
  name: '减灶',
  description: '你摸满手牌后，主动选择三张牌弃置。直到你打完手牌为止，每次你结算伤害时，额外加上这三张牌的总分数',
  timing: SkillTiming.ON_HAND_REFILLED,
  priority: 100,
  dialogLines: ['减灶示弱，骄兵必败。', '今日之弃，乃明日之胜。', '灶减而志不减。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('sunbin')) return false;
    return ctx.battle.player.hand.length >= 3;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.player.hand;
    if (hand.length < 3) return;

    visuals.playSkillTriggerSound();

    // 公共事件「选择手牌」：玩家在手牌区交互选 3 张（确认/取消），敌人直接返回 AI 判断
    const chosen = await (ctx.gameScene as Phaser.Scene & HandSelectEvent).selectHandCards({
      side: ctx.playerCharacterIds.includes(ctx.sourceCharacterId) ? 'player' : 'enemy',
      want: (sel) => sel.length === 3,
      filter: () => true,
      forced: false,
      title: '减灶 · 选择三张牌弃置',
      // 敌人 AI：弃置分数最低的 3 张（保留高价值牌）
      aiPick: (aiHand) => [...aiHand]
        .sort((a, b) => (a.score ?? a.rank) - (b.score ?? b.rank))
        .slice(0, 3),
    });
    if (chosen?.length !== 3) return;

    const indices: number[] = [];
    for (const c of chosen) {
      const idx = hand.findIndex(h => h.uid === c.uid);
      if (idx >= 0 && !indices.includes(idx)) indices.push(idx);
    }
    if (indices.length !== 3) return;

    // 普通弃置：从手牌移除并进入弃牌堆
    await discardCardsFromHand(ctx.gameScene, 'player', indices);

    const bonus = chosen.reduce((sum, c) => sum + (c.score ?? c.rank), 0);
    ctx.battle.jianzaoBonus = bonus;
    ctx.battle.jianzaoActive = true;

    await showNotice(ctx.gameScene, `减灶：弃置 3 张，本次手牌周期伤害 +${bonus}`);
  },
};

/**
 * 孙膑「减灶」（加成）：效果生效期间，每次你结算伤害时（所有牌伤害累加完成后、
 * 系数亮出之前），额外加上弃置三张牌的总分数。
 *
 * - 加成时机 ON_DAMAGE_ACCUMULATED（stage1 累加结束、stage2 系数显示之前）。
 * - 只作用于玩家打出的牌结算给敌方（target === 'enemy'）；不加倍、不改系数，
 *   仅增加 damageInfo.sumRanks，并同步更新中央累计伤害计数器显示值（数字跳动动画）。
 * - 绝不 emit 技能事件、绝不 cancelDamageSettlement。
 */
export const SunBinJianZaoBonus: SkillDefinition = {
  id: 'sunbin_jianzao_bonus',
  name: '减灶',
  description: '',
  timing: SkillTiming.ON_DAMAGE_ACCUMULATED,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('sunbin')) return false;
    if (ctx.target !== 'enemy') return false;
    if (!ctx.damageInfo) return false;
    return ctx.battle.jianzaoActive === true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const bonus = ctx.battle.jianzaoBonus;
    if (bonus <= 0 || !ctx.damageInfo) return;

    ctx.damageInfo.sumRanks += bonus;

    visuals.playSkillTriggerSound();

    // 同步更新中央累计伤害计数器显示值（数字跳动动画，参照 stage1 计数器的更新方式）
    const counter = ctx.damageCounterText;
    if (counter) {
      const current = parseInt(counter.text, 10) || 0;
      await waitForCounterTween(ctx.gameScene, {
        from: current,
        to: current + bonus,
        duration: 400,
        ease: 'Cubic.easeOut',
        onUpdate: (val) => counter.setText(`${Math.round(val)}`),
      });
    }

    await showNotice(ctx.gameScene, `减灶：伤害 +${bonus}`);
  },
};

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
