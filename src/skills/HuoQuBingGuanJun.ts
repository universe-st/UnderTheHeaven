import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { HAND_TYPE_LABELS } from '../models/BattleTypes';
import { animateCoefficientUpdate, waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';
import type { PlayerCharacterId } from '../models/Character';

const HUO_QU_BING: PlayerCharacterId = 'huoqubing';

/**
 * 霍去病「冠军」：X 为整盘游戏（跨战斗）本技能触发的次数。
 * 计数存于 battle.player.skillFlags['huoqubing_guanjun_count']，
 * 战斗结束由 BattleFlowManager 合并写回 run.characterSkillFlags（跨对局继承）。
 */
export const HUO_QU_BING_GUANJUN_COUNT_KEY = 'huoqubing_guanjun_count';

/** 「冠军」触发上限：X=6 时移除此角色 */
export const HUO_QU_BING_LIMIT = 6;

function hasHuoQuBing(ctx: SkillContext): boolean {
  return ctx.playerCharacterIds.includes(HUO_QU_BING)
    && !(ctx.battle.player.lostCharacters ?? []).includes(HUO_QU_BING);
}

/**
 * 霍去病「冠军」（触发技）：系数亮出时，你令系数 +2X。
 * X 为整盘游戏中此技能触发的次数；X 为 6 时移除此角色。
 *
 * - 时机 ON_COEFFICIENT_REVEALED：玩家造成伤害结算、系数揭示后（同苏秦「合纵」）；
 * - 加成：在现有系数上直接相加 +2X（不基于 baseCoefficient 重算，保留其他技能加成）；
 * - X 跨战斗累计：skillFlags['huoqubing_guanjun_count']，每次触发 +1；
 * - X 达到 6 时：lostCharacters + markCharacterLost（本场技能停用、角色从角色区消失，
 *   战斗结束由 BattleFlowManager 从阵容永久移除）。
 */
export const HuoQuBingGuanJun: SkillDefinition = {
  id: 'huoqubing_guanjun',
  name: '冠军',
  description: '系数亮出时，你令系数+2X。X为整盘游戏中此技能触发的次数。X为6时，移除此角色。',
  timing: SkillTiming.ON_COEFFICIENT_REVEALED,
  priority: 60,
  dialogLines: [
    '匈奴未灭，何以家为！',
    '封狼居胥，冠军天下！',
    '犯我强汉者，虽远必诛！',
  ],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!hasHuoQuBing(ctx)) return false;
    if (!ctx.damageInfo) return false;
    return ctx.pattern !== undefined && ctx.pattern.cards.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    const { damageInfo, coefficientLabel, pattern, battle } = ctx;
    if (!damageInfo || !pattern) return;

    // 触发次数 +1（跨战斗累计）
    const flags = (battle.player.skillFlags ??= {});
    const X = ((flags[HUO_QU_BING_GUANJUN_COUNT_KEY] as number) ?? 0) + 1;
    flags[HUO_QU_BING_GUANJUN_COUNT_KEY] = X;

    const oldCoefficient = damageInfo.coefficient;
    const newCoefficient = oldCoefficient + 2 * X;

    visuals.playSkillTriggerSound();
    // 本次所有牌放大强调（冠军生效的牌组）
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

    // X 达到上限：移除此角色（本场技能停用 + 角色从角色区消失）
    if (X >= HUO_QU_BING_LIMIT) {
      await removeHuoQuBing(ctx, visuals, X);
    }
  },
};

/** 移除霍去病：写入 lostCharacters（本场技能停用），角色框淡出消失，显示离场提示 */
async function removeHuoQuBing(
  ctx: SkillContext,
  visuals: SkillVisualManager,
  X: number,
): Promise<void> {
  const scene = visuals.getScene();
  ctx.battle.player.lostCharacters = [
    ...(ctx.battle.player.lostCharacters ?? []),
    HUO_QU_BING,
  ];
  // 清零「冠军」计数：避免黄金台重新招募后计数仍为 6，一触发就再次移除
  // （与蓝玉「桀骜」移除后清零「骜」标记同理，见 BattleFlowManager lostCharacters 清理）
  const flags = ctx.battle.player.skillFlags;
  if (flags) {
    flags[HUO_QU_BING_GUANJUN_COUNT_KEY] = 0;
  }
  visuals.markCharacterLost(HUO_QU_BING);

  const { width, height } = scene.scale;
  const text = scene.add.text(width / 2, height / 2 + 140, `霍去病 冠军已达${X}次，功成身退，离开队伍！`, {
    fontSize: '34px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#c84030',
    stroke: '#1a0800',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT).setAlpha(0);

  await waitForTween(scene, { targets: text, alpha: 1, duration: 200, ease: 'Sine.easeOut' });
  await waitForDelay(scene, 900);
  await waitForTween(scene, {
    targets: text,
    alpha: 0,
    y: text.y - 40,
    duration: 400,
    ease: 'Sine.easeIn',
    onComplete: () => text.destroy(),
  });
}
