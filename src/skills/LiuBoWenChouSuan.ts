import type { ActiveSkillDefinition, ActiveSkillSceneAccess } from './SkillTypes';
import type { Card } from '../models/Card';
import { rankToLabel, sortHand, getNextCardId } from '../models/Card';
import { canUseChouCe, middleRanksBetween } from './LiuBoWenChouSuanLogic';
import { createPokerCardVisual } from '../utils/CardVisual';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { UIFactory } from '../utils/UIFactory';
import { CARD_W, CARD_H, CARD_OVERLAP_OFFSET } from '../constants/Layout';

async function createTempCardToHand(
  scene: ActiveSkillSceneAccess & Phaser.Scene,
  tempCard: Card,
): Promise<void> {
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);

  // 使用与手牌区完全相同的卡面样式（createPokerCardVisual）
  const cardFace = createPokerCardVisual(scene, tempCard, 0, 0);
  overlay.add(cardFace);

  const spiderGfx = scene.add.graphics();
  UIFactory.drawSpiderWeb(spiderGfx, CARD_W, CARD_H);
  spiderGfx.setAlpha(0);
  overlay.add(spiderGfx);

  const yellowOverlay = scene.add.graphics();
  yellowOverlay.fillStyle(0xffd700, 0.18);
  yellowOverlay.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  yellowOverlay.setAlpha(0);
  overlay.add(yellowOverlay);

  await waitForTween(scene, {
    targets: overlay,
    alpha: { from: 0, to: 1 },
    scaleX: { from: 0.3, to: 1 },
    scaleY: { from: 0.3, to: 1 },
    duration: 500,
    ease: 'Back.easeOut',
  });

  await waitForTween(scene, {
    targets: [spiderGfx, yellowOverlay],
    alpha: 1,
    duration: 300,
    ease: 'Sine.easeOut',
  });

  await waitForDelay(scene, 500);

  const hand = scene.getBattle().player.hand;
  const overlapOffset = CARD_OVERLAP_OFFSET;
  const totalW = CARD_W + (hand.length * overlapOffset);
  const startX = (width - totalW) / 2 + CARD_W / 2;
  const baseY = height - 90;
  const targetIndex = hand.length;
  const targetX = startX + targetIndex * overlapOffset;

  await waitForTween(scene, {
    targets: overlay,
    x: targetX,
    y: baseY,
    scaleX: 1,
    scaleY: 1,
    duration: 400,
    ease: 'Cubic.easeIn',
  });

  overlay.destroy();
}

export const LiuBoWenChouCe: ActiveSkillDefinition = {
  id: 'liubowen_chouce',
  name: '筹策',
  description: '（主动技）选择两张点数差大于1的牌（大王、小王、2除外），创造一张点数在两者之间的临时牌，创造的牌花色与点数较大的牌一致。每次牌权限一次。',
  maxUses: 1,
  ownerCharacterId: 'liubowen',
  dialogLines: [
    '人算不如天算，天算不如我算！',
    '运筹帷幄，决胜千里！',
    '天机在手，妙手偶得！',
  ],

  cardFilter: canUseChouCe,

  execute: async (scene, selectedCards) => {
    const hand = scene.getBattle().player.hand;

    const [a, b] = selectedCards as [Card, Card];
    const rankA = Math.min(a.rank, b.rank);
    const rankB = Math.max(a.rank, b.rank);

    const possibleRanks = middleRanksBetween(rankA, rankB);
    if (possibleRanks.length === 0) return;

    const middleRank = possibleRanks[Math.floor(Math.random() * possibleRanks.length)]!;

    const largerCard = a.rank >= b.rank ? a : b;
    const inheritedSuit = largerCard.suit;

    const tempCard: Card = {
      uid: getNextCardId(),
      suit: inheritedSuit,
      rank: middleRank,
      rankLabel: rankToLabel(middleRank),
      score: middleRank,
      isTemp: true,
    };

    const idxA = hand.findIndex(c => c.uid === a.uid);
    const idxB = hand.findIndex(c => c.uid === b.uid && c.uid !== a.uid);

    if (idxA === -1 || idxB === -1) return;

    await createTempCardToHand(scene, tempCard);

    hand.push(tempCard);
    sortHand(hand);

    scene.renderPlayerHandAfterSkill();
  },
};
