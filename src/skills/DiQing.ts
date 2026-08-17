import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';

const DI_QING = 'diqing';

/**
 * 狄青「稳进」由两个 SkillDefinition 拆分实现（触发时机不同），
 * 在角色数据中仅作为同一个技能显示（markerLabel: '稳'）：
 *   1. DiQingWenJinMarker — 你每次打出的牌中最大点数若比本次对局上次打出的牌最大点数大，
 *                           获得一个"稳进"标记（ON_PLAY，先手与响应都算「打出」）
 *   2. DiQingWenJinBonus  — 每张牌结算伤害时，消耗一个"稳进"标记令该牌伤害+20
 *                           （ON_SINGLE_CARD_SETTLEMENT，逐张结算）
 *
 * 标记存于 battle.diqingSteadyMarks（战斗内），对局结束 battle 丢弃即清空；
 * 上次最大点数存于 battle.diqingLastMaxRank（undefined 视为 0——对局首手视为满足条件）。
 * 点数取视为点数优先：consideredAs?.rank ?? rank，与接牌判定一致。
 */
/** 效果一：打出的牌最大点数比上次大时，获得一个"稳进"标记 */
export const DiQingWenJinMarker: SkillDefinition = {
  id: 'diqing_wenjin_marker',
  name: '稳进',
  description: '你每次打出的牌中最大点数若比你本次对局上次打出的牌最大点数大，你获得一个『稳进』标记',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['兵贵神速，看我破阵！', '面涅将军，威震西夏！', '临敌制胜，贵在神速。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(DI_QING)) return false;
    if (ctx.target !== 'enemy') return false;
    // 先手与响应都算「打出」：无需 isRespond 限制
    return ctx.pattern !== undefined;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const pattern = ctx.pattern;
    if (!pattern || pattern.cards.length === 0) return;

    // 最大点数：视为点数优先（consideredAs?.rank ?? rank），与接牌判定一致
    const maxRank = Math.max(...pattern.cards.map(c => c.consideredAs?.rank ?? c.rank));
    const last = ctx.battle.diqingLastMaxRank ?? 0;

    if (maxRank > last) {
      const markers = (ctx.battle.diqingSteadyMarks ?? 0) + 1;
      ctx.battle.diqingSteadyMarks = markers;
      visuals.playSkillTriggerSound();
      visuals.updateMarker(DI_QING, markers);
    }

    // 无论是否获得标记，都更新本次对局「上次打出牌的最大点数」
    ctx.battle.diqingLastMaxRank = maxRank;
  },
};

/** 效果二：每张牌结算伤害时，消耗一个"稳进"标记令该牌伤害+20 */
export const DiQingWenJinBonus: SkillDefinition = {
  id: 'diqing_wenjin_bonus',
  name: '稳进',
  description: '',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(DI_QING)) return false;
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    return (ctx.battle.diqingSteadyMarks ?? 0) > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const marks = ctx.battle.diqingSteadyMarks ?? 0;
    if (marks <= 0) return;

    // 消耗一个标记，剩余不足则后续结算牌无加成
    ctx.battle.diqingSteadyMarks = marks - 1;
    visuals.updateMarker(DI_QING, marks - 1);

    // 该张牌 scoreBonus += 20（含计数器数字动画）
    await modifyCardDamage(ctx, visuals, 20);
  },
};
