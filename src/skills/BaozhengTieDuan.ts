import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type ResponseBlockModifier } from './SkillTypes';
import { HAND_TYPE_LABELS, HandType, type HandPattern } from '../models/BattleTypes';
import { animateCoefficientUpdate } from '../utils/AnimationUtils';
import { isTieDuanSingle } from '../engine/CharacterAbilities';

/** 铁断封锁：对方无法使用任何牌应对 —— 封锁全部 12 种牌型（含王炸） */
export const ALL_HAND_TYPES: HandType[] = [
  HandType.Single,
  HandType.Pair,
  HandType.Triple,
  HandType.TripleOne,
  HandType.TriplePair,
  HandType.Straight,
  HandType.ConsecutivePairs,
  HandType.Airplane,
  HandType.AirplaneSingle,
  HandType.AirplanePair,
  HandType.Bomb,
  HandType.Rocket,
];

/** 铁断「对方无法使用任何牌应对」：lastPlay 为单张 9/小王/大王时封锁全部响应牌型 */
export const BaozhengTieDuanBlock: ResponseBlockModifier = {
  type: 'response_block',
  getBlockedTypes: (ctx: { lastPlay: HandPattern }): HandType[] => {
    if (isTieDuanSingle(ctx.lastPlay)) return ALL_HAND_TYPES;
    return [];
  },
};

/** 铁断按牌面区分的台词：大王/小王/9 对应龙头铡/虎头铡/狗头铡 */
export const TIE_DUAN_DIALOG_BY_RANK: Record<number, string> = {
  30: '这龙头铡，铡的是违法乱国的皇亲国戚！',
  25: '这虎头铡，铡的是贪赃枉法的乱臣贼子！',
  9: '这狗头铡，铡的是横行霸道的流氓地痞！',
};

/** 取铁断单张对应台词（非铁断牌返回空串） */
export function tieDuanDialog(pattern: HandPattern | null | undefined): string {
  if (!isTieDuanSingle(pattern)) return '';
  const card = pattern!.cards[0]!;
  const rank = card.consideredAs?.rank ?? card.rank;
  return TIE_DUAN_DIALOG_BY_RANK[rank] ?? '';
}

/**
 * 铁断（视觉反馈）：打出单张 9/小王/大王时的出牌反馈。
 * 按牌面显示对应铡刀台词（dialogLines 留空，台词由 execute 按 rank 指定）。
 * 核心规则（无视大小牌型接牌 + 封锁对方响应 + 系数+5）由
 * CharacterAbilities.canPlayerBeat / BaozhengTieDuanBlock / BaozhengTieDuanCoefficient 承担。
 */
export const BaozhengTieDuan: SkillDefinition = {
  id: 'baozheng_tieduan',
  name: '铁断',
  description: '你的单张【大王】、【小王】与【9】可以无视大小和牌型，响应对方打出的任何牌，并且对方无法使用任何牌应对。你使用单张【大王】、【小王】与【9】结算伤害时系数+5。',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: [],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    return isTieDuanSingle(ctx.pattern);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();
    if (ctx.centerCardContainers && ctx.centerCardContainers.length > 0) {
      visuals.animateCardScale(ctx.centerCardContainers);
    }
    const line = tieDuanDialog(ctx.pattern);
    if (line) {
      visuals.showDialog(ctx.sourceCharacterId, line);
    }
  },
};

/**
 * 铁断（系数加成）：使用单张 9/小王/大王结算伤害时系数+5。
 * 内部技能条目（hidden），与 ON_PLAY 视觉技能拆分注册。
 */
export const BaozhengTieDuanCoefficient: SkillDefinition = {
  id: 'baozheng_tieduan_coeff',
  name: '铁断',
  description: '',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 10,
  dialogLines: [],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (ctx.damageInfo === undefined) return false;
    return isTieDuanSingle(ctx.pattern);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, pattern, coefficientLabel } = ctx;
    if (!damageInfo || !pattern) return;

    const oldCoefficient = damageInfo.coefficient;
    const newCoefficient = oldCoefficient + 5;

    visuals.playSkillTriggerSound();
    if (ctx.centerCardContainers && ctx.centerCardContainers.length > 0) {
      visuals.animateCardScale(ctx.centerCardContainers, 1.35, 200);
    }

    damageInfo.coefficient = newCoefficient;
    damageInfo.finalDamage = Math.round(
      damageInfo.sumRanks * newCoefficient * (damageInfo.damageMultiplier ?? 1),
    );

    if (coefficientLabel) {
      const typeLabel = HAND_TYPE_LABELS[pattern.type];
      await animateCoefficientUpdate(
        scene,
        coefficientLabel,
        typeLabel,
        oldCoefficient,
        newCoefficient,
        800,
      );
    }
  },
};
