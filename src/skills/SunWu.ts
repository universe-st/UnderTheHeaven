import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { cardScoreBoostKey } from '../models/Card';
import { waitForTween, waitForDelay, waitForCounterTween } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';

const SUN_WU = 'sunwu';

/**
 * 孙武「练兵」由两个 SkillDefinition 拆分实现（触发时机不同），
 * 在角色数据中仅作为同一个技能显示：
 *   1. SunWuLianBing      — 你打出的牌分数永久+3（ON_PLAY，先手与响应都算「打出」）
 *   2. SunWuLianBingBonus — 若成功进行伤害结算，结算前每张分数再次永久+3
 *                           （ON_DAMAGE_ACCUMULATED，整次结算触发一次）
 *
 * 永久加分与田文「养士」同模式：直接修改卡牌对象 card.score（打出/弃置/洗回后保留），
 * 同时按卡牌身份键（cardScoreBoostKey）累加 battle.player.scoreBoosts，
 * 战斗结束由 BattleFlowManager 合并写回 run.scoreBoosts（跨对局继承）。
 *
 * 段二在 ON_DAMAGE_ACCUMULATED（stage1 累加后、系数亮出前）触发——广播前已有
 * damageSettlementCancelled 检查，能走到该时机 = 结算未被取消 = 「成功进行伤害结算」；
 * 除了永久加分，还同步增加本次伤害 sumRanks（3 × 张数），随后 finalDamage 重算自然包含。
 */

/** 效果一：你打出的牌分数永久+3 */
export const SunWuLianBing: SkillDefinition = {
  id: 'sunwu_lianbing',
  name: '练兵',
  description: '你打出的牌分数永久+3，若成功进行伤害结算，结算前每张分数再次永久+3',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['兵者，国之大事！', '知己知彼，百战不殆！', '练兵千日，用兵一时。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(SUN_WU)) return false;
    if (ctx.target !== 'enemy') return false;
    // 先手与响应都算「打出」：无需 isRespond 限制
    return ctx.pattern !== undefined;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const pattern = ctx.pattern;
    if (!pattern || pattern.cards.length === 0) return;

    visuals.playSkillTriggerSound();

    // 永久加分：直接改卡牌对象 + 累加 scoreBoosts（与田文「养士」一致）
    const boosts = (ctx.battle.player.scoreBoosts ??= {});
    for (const card of pattern.cards) {
      card.score += 3;
      const key = cardScoreBoostKey(card);
      boosts[key] = (boosts[key] ?? 0) + 3;
    }

    // 分数数据已更新；卡面不显示分数，长按手牌信息窗可查。
    // 重建手牌渲染以保持数据与显示一致（宿主场景提供 renderPlayerHand）。
    (ctx.gameScene as unknown as { renderPlayerHand?: () => void }).renderPlayerHand?.();
  },
};

/** 效果二：若成功进行伤害结算，结算前每张分数再次永久+3（并同步本次伤害） */
export const SunWuLianBingBonus: SkillDefinition = {
  id: 'sunwu_lianbing_bonus',
  name: '练兵',
  description: '',
  timing: SkillTiming.ON_DAMAGE_ACCUMULATED,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(SUN_WU)) return false;
    if (ctx.target !== 'enemy') return false;
    if (!ctx.damageInfo) return false;
    return ctx.pattern !== undefined && ctx.pattern.cards.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const pattern = ctx.pattern;
    const damageInfo = ctx.damageInfo;
    if (!pattern || pattern.cards.length === 0 || !damageInfo) return;

    visuals.playSkillTriggerSound();

    // 永久加分：直接改卡牌对象 + 累加 scoreBoosts（与田文「养士」一致）
    const boosts = (ctx.battle.player.scoreBoosts ??= {});
    for (const card of pattern.cards) {
      card.score += 3;
      const key = cardScoreBoostKey(card);
      boosts[key] = (boosts[key] ?? 0) + 3;
    }

    // 本次伤害也吃到加成：sumRanks += 3 × 张数，随后 finalDamage 重算自然包含
    const bonus = 3 * pattern.cards.length;
    damageInfo.sumRanks += bonus;

    // 同步更新中央累计伤害计数器显示值（数字跳动动画，参照减灶的更新方式）
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

    await showNotice(ctx.gameScene, `练兵：伤害 +${bonus}`);
  },
};

/** 屏幕中部提示文字（浮现 → 停留 → 上浮淡出，参照孙膑「减灶」实现） */
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
