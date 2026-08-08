import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { shuffleDeck, sortHand } from '../models/Card';
import { waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY } from '../constants/Layout';

const PI_DIGITS = [
  3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4,
  6, 2, 6, 4, 3, 3, 8, 3, 2, 7, 9, 5, 0, 2, 8, 8, 4, 1, 9, 7,
  1, 6, 9, 3, 9, 9, 3, 7, 5, 1, 0, 5, 8, 2, 0, 9, 7, 4, 9, 4,
  4, 5, 9, 2, 3, 0, 7, 8, 1, 6, 4, 0, 6, 2, 8, 6, 2, 0, 8, 9,
  9, 8, 6, 2, 8, 0, 3, 4, 8, 2, 5, 3, 4, 2, 1, 1, 7, 0, 6, 7, 9,
];

function rankToPiDigit(rank: number): number | null {
  if (rank >= 3 && rank <= 9) return rank;
  if (rank === 10) return 0;
  if (rank === 15) return 1;
  if (rank === 20) return 2;
  return null;
}

function isPiPrefix(cards: Card[]): boolean {
  const n = cards.length;
  if (n === 0 || n > PI_DIGITS.length) return false;
  const digits: number[] = [];
  for (const c of cards) {
    const d = rankToPiDigit(c.rank);
    if (d === null) return false;
    digits.push(d);
  }
  const sortedSelected = [...digits].sort((a, b) => a - b);
  const sortedPiPrefix = PI_DIGITS.slice(0, n).sort((a, b) => a - b);
  for (let i = 0; i < n; i++) {
    if (sortedSelected[i] !== sortedPiPrefix[i]) return false;
  }
  return true;
}

export const ZuChongZhiYuanZhou: ActiveSkillDefinition = {
  id: 'zuchongzhi_yuanzhou',
  name: '圆周',
  description: '（主动技）选择任意张牌，其点数能排列成圆周率开头的序列（如 3、1、4、1、5、9、2、6…）即可弃置，然后摸等量的牌。每次牌权限一次。',
  maxUses: 1,
  ownerCharacterId: 'zuchongzhi',

  cardFilter: (selectedCards: Card[]): boolean => {
    if (selectedCards.length === 0) return false;
    return isPiPrefix(selectedCards);
  },

  execute: async (scene, selectedCards) => {
    const hand = scene.getBattle().player.hand;
    const deck = scene.getBattle().player.deck;
    const discardPile = scene.getBattle().player.discardPile;

    const indices: number[] = [];
    for (const card of selectedCards) {
      const idx = hand.findIndex(c => c.uid === card.uid);
      if (idx !== -1) indices.push(idx);
    }
    if (indices.length === 0) return;

    const count = indices.length;

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const overlay = scene.add.container(centerX, centerY).setDepth(999);

    const bg = scene.add.graphics();
    bg.fillStyle(0x1a0a2a, 0.9);
    bg.fillRoundedRect(-130, -60, 260, 120, 14);
    bg.lineStyle(2, 0xffd700, 0.7);
    bg.strokeRoundedRect(-130, -60, 260, 120, 14);
    overlay.add(bg);

    const piText = scene.add.text(0, -16, 'π = 3.1415...', {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      color: '#ffd700',
      stroke: '#1a0a2a',
      strokeThickness: 2,
    }).setOrigin(0.5);
    overlay.add(piText);

    const subText = scene.add.text(0, 20, `弃 ${count} 摸 ${count}`, {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      color: '#c8a080',
    }).setOrigin(0.5);
    overlay.add(subText);

    overlay.setScale(0.5);
    overlay.setAlpha(0);
    await new Promise<void>(resolve => {
      scene.tweens.add({
        targets: overlay,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 350,
        ease: 'Back.easeOut',
        onComplete: () => resolve(),
      });
    });

    await waitForDelay(scene, 500);

    const sortedIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      const [removed] = hand.splice(idx, 1);
      if (removed) {
        discardPile.push(removed);
      }
    }

    let currentDeck = deck;
    if (currentDeck.length < count) {
      const remaining = currentDeck.splice(0);
      const shuffled = shuffleDeck(discardPile);
      discardPile.length = 0;
      deck.length = 0;
      deck.push(...shuffled, ...remaining);
      currentDeck = deck;
    }

    const drawn: Card[] = [];
    for (let i = 0; i < count && currentDeck.length > 0; i++) {
      drawn.push(currentDeck.pop()!);
    }

    hand.push(...drawn);
    sortHand(hand);

    await new Promise<void>(resolve => {
      scene.tweens.add({
        targets: overlay,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 250,
        ease: 'Sine.easeIn',
        onComplete: () => {
          overlay.destroy();
          resolve();
        },
      });
    });

    scene.renderPlayerHandAfterSkill();
  },
};
