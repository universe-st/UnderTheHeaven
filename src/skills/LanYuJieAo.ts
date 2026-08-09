import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { modifyCardDamage } from './SkillUtils';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';
import type { PlayerCharacterId } from '../models/Character';

const LAN_YU: PlayerCharacterId = 'lanyu';

/**
 * 蓝玉「桀骜」由三个 SkillDefinition 拆分实现（触发时机不同），
 * 在角色数据中仅作为同一个技能显示：
 *   1. LanYuJieAoMarker — 每次造成伤害后获得"骜"标记（AFTER_HEALTH_DECREASE）
 *   2. LanYuJieAoBonus  — 单牌计算伤害+X，X为"骜"标记数量（ON_SINGLE_CARD_SETTLEMENT）
 *   3. LanYuJieAoLost   — 一次造成伤害大于自己气数时，失去该角色牌（AFTER_HEALTH_DECREASE）
 *
 * 跨战斗语义（由局状态 RunState 承载）：
 *   - "骜"标记存于 battle.player.aoMarkers（战斗内累计），战斗结束时由
 *     BattleFlowManager 写回 run.characterMarkers['lanyu']，下场战斗读入继续积累；
 *   - 失去角色牌后蓝玉技能立即停用（本场），战斗结束时从 run.roster 永久移除
 *     （黄金台可重新招募），标记清零。
 *
 * 蓝玉在阵容中且未失去时技能才生效；失去后（battle.player.lostCharacters
 * 含 'lanyu'）三个技能的 filter 均返回 false，技能自动停用。
 */
function hasLanYu(ctx: SkillContext): boolean {
  return ctx.playerCharacterIds.includes(LAN_YU)
    && !(ctx.battle.player.lostCharacters ?? []).includes(LAN_YU);
}

/** 效果一：每次造成伤害后获得一个"骜"标记 */
export const LanYuJieAoMarker: SkillDefinition = {
  id: 'lanyu_jieao_marker',
  name: '桀骜',
  description: '你每次造成伤害后，获得一个"骜"标记',
  timing: SkillTiming.AFTER_HEALTH_DECREASE,
  priority: 90,
  dialogLines: ['桀骜难驯！', '一鼓作气！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!hasLanYu(ctx)) return false;
    return (ctx.damageInfo?.finalDamage ?? 0) > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const markers = (ctx.battle.player.aoMarkers ?? 0) + 1;
    ctx.battle.player.aoMarkers = markers;

    visuals.playSkillTriggerSound();
    visuals.updateMarker(LAN_YU, markers);
  },
};

/** 效果二：你单牌计算伤害+X，X为"骜"标记的数量 */
export const LanYuJieAoBonus: SkillDefinition = {
  id: 'lanyu_jieao_bonus',
  name: '桀骜',
  description: '你单牌计算伤害+X，X为"骜"标记的数量',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!ctx.singleCard) return false;
    if (!hasLanYu(ctx)) return false;
    return (ctx.battle.player.aoMarkers ?? 0) > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const markers = ctx.battle.player.aoMarkers ?? 0;
    if (markers <= 0) return;
    await modifyCardDamage(ctx, visuals, markers);
  },
};

/** 效果三：当你一次给对方造成的伤害数量大于自己的气数时，你失去该角色牌 */
export const LanYuJieAoLost: SkillDefinition = {
  id: 'lanyu_jieao_lost',
  name: '桀骜',
  description: '当你一次给对方造成的伤害数量大于自己的气数时，你失去该角色牌',
  timing: SkillTiming.AFTER_HEALTH_DECREASE,
  priority: 100,
  dialogLines: ['骄兵必败……', '桀骜之殇！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!hasLanYu(ctx)) return false;
    const damage = ctx.damageInfo?.finalDamage ?? 0;
    if (damage <= 0) return false;
    return damage > ctx.battle.player.vitality;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    ctx.battle.player.lostCharacters = [...(ctx.battle.player.lostCharacters ?? []), LAN_YU];

    visuals.playSkillTriggerSound();
    visuals.markCharacterLost(LAN_YU);

    const { width, height } = scene.scale;
    const text = scene.add.text(width / 2, height / 2 + 140, '蓝玉 桀骜反噬，失去该角色牌！', {
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
  },
};
