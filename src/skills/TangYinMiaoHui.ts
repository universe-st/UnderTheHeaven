import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { randomFourSeal } from '../models/FourSeal';
import { SEAL_LABELS } from '../models/FourSeal';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY } from '../constants/Layout';

/**
 * 唐寅「妙绘」（主动技）：每次牌权限一次，你可以选择一张临时牌，令该牌变成普通牌，
 * 并有 20% 几率附加随机四象印。
 *
 * - 主动技选牌范式（与筹策/圆周/直谏一致）：requiresSelection: true，玩家在手牌区
 *   点选一张牌，选中牌通过 cardFilter（恰好一张且 isTemp === true）后技能按钮亮起，
 *   点击即发动（已选即发动，无需二次确认）。
 * - 变普通牌：card.isTemp = false（保留点数/花色/分数等原属性）。
 * - 20% 概率附加随机四象印：randomFourSeal() 四印等概率（勿用自带 25% 的 randomSeal）。
 */
export const TangYinMiaoHui: ActiveSkillDefinition = {
  id: 'tangyin_miaohui',
  name: '妙绘',
  description: '（主动技）每次牌权限一次，你可以选择一张临时牌，令该牌变成普通牌，并有 20% 几率附加随机四象印。',
  maxUses: 1,
  ownerCharacterId: 'tangyin',
  /** 需先选中一张临时牌，选中通过 cardFilter 后显示技能按钮 */
  requiresSelection: true,
  dialogLines: [
    '妙笔生花，点石成金！',
    '画龙点睛，神采顿生！',
    '我笔写我心，逍遥天地间！',
  ],

  cardFilter: (selectedCards: Card[]): boolean =>
    selectedCards.length === 1 && selectedCards[0]!.isTemp === true,

  execute: async (scene, selectedCards) => {
    const card = selectedCards[0];
    if (!card) return;

    const battle = scene.getBattle();
    const hand = battle.player.hand;
    const idx = hand.findIndex((c) => c.uid === card.uid);
    if (idx < 0) return;

    const target = hand[idx]!;

    // 1) 令其变成普通牌（保留点数/花色/分数等原属性）
    target.isTemp = false;

    // 2) 20% 几率附加随机四象印（四印等概率）
    let sealAttached = false;
    if (Math.random() < 0.2) {
      target.seal = randomFourSeal();
      sealAttached = true;
    }

    // 中央提示动画：妙绘成笔（飞入 → 停留 → 上浮淡出）
    await showPaintNotice(scene, sealAttached ? `妙绘：已成普通牌 · 印上${SEAL_LABELS[target.seal!]}` : '妙绘：已成普通牌');

    scene.renderPlayerHandAfterSkill();
  },
};

/** 屏幕中部提示文字（浮现 → 停留 → 上浮淡出） */
async function showPaintNotice(
  scene: Phaser.Scene,
  text: string,
): Promise<void> {
  const { width, height } = scene.scale;
  const t = scene.add.text(width / 2, height / 2 + 160, text, {
    fontSize: '34px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#ffd700',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5).setAlpha(0);

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
