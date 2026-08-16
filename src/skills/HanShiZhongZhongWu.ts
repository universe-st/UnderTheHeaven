import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import { animateCoefficientUpdate } from '../utils/AnimationUtils';

const HAN_SHI_ZHONG = 'hanshizhong';

function hasHanShiZhong(ctx: SkillContext): boolean {
  return ctx.playerCharacterIds.includes(HAN_SHI_ZHONG);
}

/**
 * 韩世忠「忠武」由两个 SkillDefinition 拆分实现（触发时机不同），
 * 在角色数据中仅作为同一个技能显示（markerLabel: '武'）：
 *   1. HanShiZhongZhongWuMarker — 你响应对方的牌时获得"忠武"标记（ON_PLAY + isRespond）
 *   2. HanShiZhongZhongWuBonus  — 你结算卡牌伤害时，消耗所有标记增加等量的系数
 *                                 （ON_COEFFICIENT_REVEALED，系数 += 标记数）
 *
 * 标记存于 battle.player.zhongwuMarkers（战斗内），对局结束 battle 丢弃即清空，
 * 无需跨战斗持久化。标记随响应链累积、结算时一次性消耗；结算前不因受伤而清空，
 * 可跨圈留存，契合"忠武"以守代攻的设计。
 */
/** 效果一：你响应对方的牌时，获得一个"忠武"标记 */
export const HanShiZhongZhongWuMarker: SkillDefinition = {
  id: 'hanshizhong_zhongwu_marker',
  name: '忠武',
  description: '你响应对方的牌时，获得"忠武"标记',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['忠勇可鉴！', '誓死护国！', '此身许国，死不旋踵！'],

  filter: (ctx: SkillContext): boolean => {
    if (!hasHanShiZhong(ctx)) return false;
    if (ctx.target !== 'enemy') return false;
    // 必须为响应（跟牌）出牌：先手/主动出牌不获得标记
    return ctx.isRespond === true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const markers = (ctx.battle.player.zhongwuMarkers ?? 0) + 1;
    ctx.battle.player.zhongwuMarkers = markers;

    visuals.playSkillTriggerSound();
    visuals.updateMarker(HAN_SHI_ZHONG, markers);
  },
};

/** 效果二：你结算卡牌伤害时，消耗所有"忠武"标记，系数增加等量 */
export const HanShiZhongZhongWuBonus: SkillDefinition = {
  id: 'hanshizhong_zhongwu_bonus',
  name: '忠武',
  description: '',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (!hasHanShiZhong(ctx)) return false;
    if (ctx.target !== 'enemy') return false;
    if (!ctx.damageInfo) return false;
    return (ctx.battle.player.zhongwuMarkers ?? 0) > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const markers = ctx.battle.player.zhongwuMarkers ?? 0;
    const { damageInfo, coefficientLabel, pattern } = ctx;
    if (markers <= 0 || !damageInfo) return;

    const oldCoefficient = damageInfo.coefficient;
    const newCoefficient = oldCoefficient + markers;

    // 消耗所有标记
    ctx.battle.player.zhongwuMarkers = 0;
    visuals.updateMarker(HAN_SHI_ZHONG, 0);

    visuals.playSkillTriggerSound();

    damageInfo.coefficient = newCoefficient;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * newCoefficient * (damageInfo.damageMultiplier ?? 1),
    );

    if (coefficientLabel && pattern) {
      const typeLabel = HAND_TYPE_LABELS[pattern.type];
      await animateCoefficientUpdate(
        visuals.getScene(),
        coefficientLabel,
        typeLabel,
        oldCoefficient,
        newCoefficient,
        800,
      );
    }
  },
};
