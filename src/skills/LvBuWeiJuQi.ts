import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { SEAL_LABELS } from '../models/FourSeal';
import { cardDisplayName } from '../models/Card';
import { applyJuQiOnPass } from './LvBuWeiJuQiLogic';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';

const LV_BU_WEI = 'lvbuwei';

function hasLvBuWei(ctx: SkillContext): boolean {
  return ctx.playerCharacterIds.includes(LV_BU_WEI);
}

/** 中央浮字提示（生成牌进牌库） */
async function showCenterToast(scene: Phaser.Scene, message: string): Promise<void> {
  const { width, height } = scene.scale;
  const text = scene.add.text(width / 2, height / 2 + 140, message, {
    fontSize: '32px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#c8a020',
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

/**
 * 居奇（你选择不出后生成牌）：
 * - 你每次选择不出后，生成一张点数为 3、随机花色、带青龙印的普通牌，
 *   直接进入你的手牌（非临时牌，随后打出与结算均按普通牌处理）。
 */
export const LvBuWeiJuQi: SkillDefinition = {
  id: 'lvbuwei_juqi',
  name: '居奇',
  description: '你每次选择不出后，生成一张点数为3的随机花色并带有青龙印的牌。',
  timing: SkillTiming.ON_PASS,
  priority: 100,
  dialogLines: ['奇货可居！', '待价而沽，何愁不富！'],

  filter: (ctx: SkillContext): boolean => {
    // 仅「你（玩家）选择不出后」触发（ON_PASS 仅由玩家不出广播）
    return hasLvBuWei(ctx);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    visuals.playSkillTriggerSound();

    // 生成一张点数为 3、随机花色、带青龙印的普通牌，直接进入玩家手牌
    const newCard = applyJuQiOnPass(ctx.battle);

    const sealLabel = newCard.seal ? SEAL_LABELS[newCard.seal] : '';
    const message = `【居奇】${cardDisplayName(newCard)}（${sealLabel}印）进入手牌`;

    await showCenterToast(scene, message);
  },
};
