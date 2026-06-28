import type { ActiveSkillDefinition, ActiveSkillSceneAccess } from './SkillTypes';
import type { Card } from '../models/Card';
import { rankToLabel, sortHand, getNextCardId } from '../models/Card';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { UIFactory } from '../utils/UIFactory';
import { CARD_W, CARD_H, CARD_OVERLAP_OFFSET, FONT_FAMILY } from '../constants/Layout';

async function createTempCardToHand(
  scene: ActiveSkillSceneAccess & Phaser.Scene,
  tempCard: Card,
): Promise<void> {
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);

  const cardBg = scene.add.graphics();
  cardBg.fillStyle(0xf5f0e0, 1);
  cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  cardBg.lineStyle(2, 0x8a6030, 0.8);
  cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  overlay.add(cardBg);

  const suitSymbols: Record<string, string> = {
    spade: '♠', club: '♣', heart: '♥', diamond: '♦',
  };
  const suitSymbol = tempCard.suit ? (suitSymbols[tempCard.suit] ?? '') : '';
  const topColor =
    tempCard.suit === 'heart' || tempCard.suit === 'diamond' ? '#c04040' : '#1a1a1a';

  const smallSuit = scene.add.text(-CARD_W / 2 + 10, -CARD_H / 2 + 8, suitSymbol, {
    fontSize: '22px',
    fontFamily: FONT_FAMILY,
    color: topColor,
  });
  overlay.add(smallSuit);

  const rankText = scene.add.text(0, 0, tempCard.rankLabel, {
    fontSize: '64px',
    fontFamily: FONT_FAMILY,
    color: '#2a1008',
    stroke: '#ffd700',
    strokeThickness: 3,
  }).setOrigin(0.5);
  overlay.add(rankText);

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
  description: '选择两张点数差大于1的牌（除大王、小王、2外），创造一张点数在两者之间的临时牌，创造牌的花色和较大牌一致',
  maxUses: 1,
  ownerCharacterId: 'liubowen',

  cardFilter: (selectedCards: Card[]): boolean => {
    if (selectedCards.length !== 2) return false;
    const [a, b] = selectedCards as [Card, Card];
    if (a.rank === 25 || a.rank === 30 || a.rank === 20) return false;
    if (b.rank === 25 || b.rank === 30 || b.rank === 20) return false;
    if (a.rank < 3 || a.rank > 15) return false;
    if (b.rank < 3 || b.rank > 15) return false;
    const diff = Math.abs(a.rank - b.rank);
    return diff > 1;
  },

  execute: async (scene, selectedCards) => {
    const hand = scene.getBattle().player.hand;

    const [a, b] = selectedCards as [Card, Card];
    const rankA = Math.min(a.rank, b.rank);
    const rankB = Math.max(a.rank, b.rank);

    const possibleRanks: number[] = [];
    for (let r = rankA + 1; r < rankB; r++) {
      if (r >= 3 && r <= 15) {
        possibleRanks.push(r);
      }
    }
    if (possibleRanks.length === 0) return;

    const middleRank = possibleRanks[Math.floor(Math.random() * possibleRanks.length)]!;

    const largerCard = a.rank >= b.rank ? a : b;
    const inheritedSuit = largerCard.suit;

    const tempCard: Card = {
      uid: getNextCardId(),
      suit: inheritedSuit,
      rank: middleRank,
      rankLabel: rankToLabel(middleRank),
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
