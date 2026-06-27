import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { rankToLabel, sortHand, getNextCardId } from '../models/Card';
import type { GameScene } from '../scenes/GameScene';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';

const CARD_W = 180;
const CARD_H = 252;

function createSpiderWebGfx(
  gfx: Phaser.GameObjects.Graphics,
  cardW: number,
  cardH: number,
): void {
  const hw = cardW / 2;
  const hh = cardH / 2;
  const cx = 0;
  const cy = 0;

  gfx.lineStyle(1, 0x88aacc, 0.6);

  gfx.lineBetween(cx, cy, -hw, -hh);
  gfx.lineBetween(cx, cy, hw, -hh * 0.7);
  gfx.lineBetween(cx, cy, -hw * 0.6, hh);
  gfx.lineBetween(cx, cy, hw * 0.8, hh * 0.3);

  gfx.lineBetween(cx, cy, cx, -hh);
  gfx.lineBetween(cx, cy, -hw * 0.3, hh * 0.5);
  gfx.lineBetween(cx, cy, hw * 0.4, -hh * 0.3);

  gfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.7, -hh * 0.1);
  gfx.lineBetween(-hw * 0.3, -hh * 0.3, -hw * 0.15, -hh * 0.7);
  gfx.lineBetween(hw * 0.5, -hh * 0.2, hw * 0.3, -hh * 0.6);
  gfx.lineBetween(cx, -hh * 0.5, hw * 0.25, -hh * 0.8);

  gfx.lineStyle(0.8, 0x88aacc, 0.35);
  gfx.lineBetween(-hw * 0.15, -hh * 0.7, -hw * 0.45, -hh * 0.55);
  gfx.lineBetween(-hw * 0.7, -hh * 0.1, -hw * 0.5, hh * 0.2);
  gfx.lineBetween(hw * 0.3, -hh * 0.6, hw * 0.6, -hh * 0.4);
  gfx.lineBetween(cx, hh, -hw * 0.4, hh * 0.35);
  gfx.lineBetween(-hw * 0.3, hh * 0.5, -hw * 0.6, hh * 0.1);
}

async function createTempCardToHand(
  scene: GameScene,
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
    fontFamily: '"LXGWWenKai", "Noto Serif SC", serif',
    color: topColor,
  });
  overlay.add(smallSuit);

  const rankText = scene.add.text(0, 0, tempCard.rankLabel, {
    fontSize: '64px',
    fontFamily: '"LXGWWenKai", "Noto Serif SC", serif',
    color: '#2a1008',
    stroke: '#ffd700',
    strokeThickness: 3,
  }).setOrigin(0.5);
  overlay.add(rankText);

  const spiderGfx = scene.add.graphics();
  createSpiderWebGfx(spiderGfx, CARD_W, CARD_H);
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
  const overlapOffset = CARD_W * 0.75;
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

  execute: async (scene: Phaser.Scene, selectedCards: Card[]): Promise<void> => {
    const gs = scene as unknown as GameScene;
    const hand = gs.getBattle().player.hand;

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

    const idxA = hand.findIndex(
      c => c.suit === a.suit && c.rank === a.rank && !c.isTemp,
    );
    const idxB = hand.findIndex(
      (c, i) => i !== idxA && c.suit === b.suit && c.rank === b.rank && !c.isTemp,
    );

    if (idxA === -1 || idxB === -1) return;

    await createTempCardToHand(gs, tempCard);

    hand.push(tempCard);
    sortHand(hand);

    gs.renderPlayerHandAfterSkill();
  },
};
