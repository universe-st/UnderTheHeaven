import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { hasLiXin, applyLiXinMultiplier } from './ZhouChuChuHaiLogic';
import { waitForTween } from '../utils/AnimationUtils';

/**
 * 周处「励心」（触发技，需先通过「除害」转换获得）
 *
 * 你的红桃牌在单牌伤害结算后，已经累加的伤害数乘以 1.5。
 *
 * 触发时机 AFTER_SINGLE_CARD_SETTLEMENT：该红桃牌的分值已累加进中央计数器
 * （ctx.damageCounterText 的文本即「已累加的伤害数」）。技能读取后改写计数器，
 * 并同步累加差值到 damageInfo.sumRanks，保证 stage2 最终伤害计算一致。
 *
 * 跨战斗获得/失去：状态存于 battle.player.skillFlags['zhouchu_has_lixin']，
 * 战斗开始从 run.characterSkillFlags 读入，结束写回。
 */
export const ZhouChuLiXin: SkillDefinition = {
  id: 'zhouchu_lixin',
  name: '励心',
  description: '你的红桃牌在单牌伤害结算后，已经累加的伤害数乘以1.5',
  timing: SkillTiming.AFTER_SINGLE_CARD_SETTLEMENT,
  priority: 100,
  dialogLines: ['斩蛟除虎，心安理得！', '励精图治，造福乡里！'],

  filter: (ctx: SkillContext): boolean => {
    // 仅玩家（周处）造成伤害时生效
    if (ctx.target !== 'enemy') return false;
    if (!ctx.playerCharacterIds.includes('zhouchu')) return false;
    if (!ctx.singleCard) return false;
    // 当前结算的牌必须是红桃
    if ((ctx.singleCard.card.getData('suit') as string) !== 'heart') return false;
    // 必须已获得励心（跨战斗永久）
    if (!hasLiXin(ctx.battle.player.skillFlags)) return false;
    return ctx.damageCounterText !== undefined && ctx.damageInfo !== undefined;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const counter = ctx.damageCounterText;
    const damageInfo = ctx.damageInfo;
    const sc = ctx.singleCard;
    if (!counter || !damageInfo || !sc) return;

    // 已累加的伤害数（中央计数器当前值）
    const cur = parseInt(counter.text, 10) || 0;
    if (cur <= 0) return;

    const newVal = applyLiXinMultiplier(cur);
    if (newVal === cur) return;

    visuals.playSkillTriggerSound();
    visuals.animateCardScale(sc.card, 1.35, 200);

    const delta = newVal - cur;
    counter.setText(String(newVal));
    damageInfo.sumRanks += delta;

    // 计数器金光脉冲，强调放大效果
    const scene = visuals.getScene();
    const baseColor = '#cc3333';
    counter.setColor('#ffd700');
    await waitForTween(scene, {
      targets: counter,
      scaleX: { from: counter.scaleX, to: counter.scaleX * 1.15 },
      scaleY: { from: counter.scaleY, to: counter.scaleY * 1.15 },
      duration: 160,
      ease: 'Sine.easeOut',
    });
    await waitForTween(scene, {
      targets: counter,
      scaleX: { from: counter.scaleX, to: counter.scaleX / 1.15 },
      scaleY: { from: counter.scaleY, to: counter.scaleY / 1.15 },
      duration: 240,
      ease: 'Sine.easeInOut',
    });
    counter.setColor(baseColor);
  },
};
