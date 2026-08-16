import type { ActiveSkillDefinition, ActiveSkillSceneAccess } from './SkillTypes';
import type { Card } from '../models/Card';
import { createPokerCardVisual } from '../utils/CardVisual';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W } from '../constants/Layout';

const SUIT_SYMBOL: Record<string, string> = {
  spade: '♠', club: '♣', heart: '♥', diamond: '♦',
};

/** 牌面文案（普通牌：花色+点数；王：虎/龍） */
function cardFaceLabel(card: Card): string {
  return card.suit !== null ? `${SUIT_SYMBOL[card.suit] ?? ''}${card.rankLabel}` : card.rankLabel;
}

/**
 * 周瑜「反间」（主动技）
 *
 * - 每次获得牌权限一次（maxUses: 1，默认「获得牌权时重置」，不设 resetOnLostTurn）。
 * - 无需选中牌即可发动：随机查看并标记对方一张手牌（battle.fanjianMarkedUid）。
 * - 标记生效期内（到玩家下次获得牌权为止），若敌方打出的牌中包含标记牌，
 *   则该手出牌被反间劫持：以敌方打出的整手牌对敌方结算伤害，随后周瑜获得牌权
 *   （劫持逻辑在 BattleFlowManager，见 tryFanjianHijack）。
 */
export const ZhouYuFanjian: ActiveSkillDefinition = {
  id: 'zhouyu_fanjian',
  name: '反间',
  description: '（主动技）每次牌权限一次，你随机查看并标记对方一张牌。到你下次获得牌权之前，若对方打出的牌中包含你标记的牌，则视为是你打出，并直接对对方结算伤害，随后你获得牌权。',
  maxUses: 1,
  ownerCharacterId: 'zhouyu',
  dialogLines: [
    '此计反间，汝可识得？',
    '琴音未落，胜负已分。',
    '知己知彼，百战不殆。',
  ],

  /** 无需选牌即可发动 */
  cardFilter: () => false,
  requiresSelection: false,
  canUseWithoutSelection: (scene) => {
    // 周瑜必须在玩家阵容（initActiveSkills 已保证注册即在场，此处防御性复查）
    const host = scene as Phaser.Scene & ActiveSkillSceneAccess & { playerCharacterIds: string[] };
    if (!host.playerCharacterIds?.includes('zhouyu')) return false;
    const battle = scene.getBattle();
    // 已有标记 / 敌方无手牌时不可发动
    if (battle.fanjianMarkedUid != null) return false;
    return battle.enemy.hand.length > 0;
  },

  execute: async (scene) => {
    const battle = scene.getBattle();
    const enemyHand = battle.enemy.hand;
    if (enemyHand.length === 0) return;

    // 1) 随机取一张敌方手牌并明置展示（仅预览，不改变手牌）
    const idx = Math.floor(Math.random() * enemyHand.length);
    const card = enemyHand[idx]!;
    await showReveal(scene, [card]);

    // 2) 写入反间标记（BattleState.fanjianMarkedUid）
    battle.fanjianMarkedUid = card.uid;

    // 3) 提示已标记的牌面
    await showNotice(scene, `反间：已标记 ${cardFaceLabel(card)}`);
  },
};

/** 屏幕中央展示若干张牌面（缩放飞入 → 停留 → 淡出），仅预览不改变手牌 */
async function showReveal(
  scene: ActiveSkillSceneAccess & Phaser.Scene,
  cards: Card[],
): Promise<void> {
  if (cards.length === 0) return;
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  const gap = CARD_W + 60;
  const totalW = gap * (cards.length - 1);
  const startX = centerX - totalW / 2;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);
  for (let i = 0; i < cards.length; i++) {
    // 使用与手牌区完全相同的卡面样式（createPokerCardVisual）
    const cc = createPokerCardVisual(scene, cards[i]!, startX - centerX + i * gap, 0);
    overlay.add(cc);
  }

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.3, to: 1 },
    scaleY: { from: 0.3, to: 1 },
    duration: 400,
    ease: 'Back.easeOut',
  });

  await waitForDelay(scene, 1400);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    y: overlay.y - 60,
    duration: 300,
    ease: 'Sine.easeIn',
  });
  overlay.destroy();
}

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
