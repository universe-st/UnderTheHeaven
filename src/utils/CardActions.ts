import Phaser from 'phaser';
import type { Card } from '../models/Card';
import { sortHand, shuffleDeck } from '../models/Card';
import { waitForTween, waitForDelay } from './AnimationUtils';

const CARD_W = 180;
const CARD_H = 252;
const OVERLAP_OFFSET = CARD_W * 0.75;

export interface CardActionResult {
  discarded: Card[];
  drawn: Card[];
}

interface GameSceneAccess {
  battle: {
    player: { hand: Card[]; deck: Card[]; discardPile: Card[] };
    enemy: { hand: Card[]; deck: Card[]; discardPile: Card[] };
  };
  cardObjects: Phaser.GameObjects.Container[];
  enemyCardObjects: Phaser.GameObjects.Container[];
  renderPlayerHand: (animateEntry?: boolean) => void;
  renderEnemyHand: (animateEntry?: boolean, baseDelay?: number, onComplete?: () => void) => void;
  createCardDisplay: (card: Card, x: number, y: number, isSelected?: boolean) => Phaser.GameObjects.Container;
  add: Phaser.GameObjects.GameObjectFactory;
}

function gs(scene: Phaser.Scene): GameSceneAccess {
  return scene as unknown as GameSceneAccess;
}

function getHandContext(
  scene: Phaser.Scene,
  target: 'player' | 'enemy',
): {
  state: { hand: Card[]; deck: Card[]; discardPile: Card[] };
  containers: Phaser.GameObjects.Container[];
} {
  const s = gs(scene);
  if (target === 'player') {
    return { state: s.battle.player, containers: s.cardObjects };
  }
  return { state: s.battle.enemy, containers: s.enemyCardObjects };
}

export interface DiscardOptions {
  /** 是否跳过推入弃牌堆（默认 false，被移除的牌默认进入弃牌堆） */
  skipDiscardPile?: boolean;
}

/**
 * 弃置手牌：从手牌中移除指定索引的牌，播放淡出动画，将牌推入弃牌堆。
 *
 * 敌人被弃置的牌会先翻面显示牌面再播放动画；
 * 玩家被弃置的牌直接使用已有显示。
 */
export async function discardCardsFromHand(
  scene: Phaser.Scene,
  target: 'player' | 'enemy',
  indices: number[],
  options?: DiscardOptions,
): Promise<Card[]> {
  if (indices.length === 0) return [];

  const { state, containers } = getHandContext(scene, target);
  const sortedIndices = [...indices].sort((a, b) => b - a);

  const discardingContainers: Phaser.GameObjects.Container[] = [];
  for (const idx of sortedIndices) {
    if (idx < containers.length) {
      discardingContainers.push(containers[idx]);
    }
  }

  for (const idx of sortedIndices) {
    if (idx < containers.length) {
      containers.splice(idx, 1);
    }
  }

  const removed: Card[] = [];
  for (const idx of sortedIndices) {
    const [card] = state.hand.splice(idx, 1);
    if (card) {
      removed.push(card);
      if (!options?.skipDiscardPile) {
        state.discardPile.push(card);
      }
    }
  }

  // 只位移已有牌的位置，不重建
  layoutExistingHand(scene, target);

  if (discardingContainers.length > 0) {
    const s = gs(scene);
    const centerX = scene.scale.width / 2;
    const centerY = target === 'player' ? scene.scale.height - 200 : 475;

    for (let i = 0; i < discardingContainers.length; i++) {
      const container = discardingContainers[i];
      const card = removed[i];
      if (target === 'enemy' && card) {
        const faceUp = s.createCardDisplay(card, container.x, container.y, false);
        faceUp.setDepth(450);
        container.destroy();
        discardingContainers[i] = faceUp;
      } else {
        container.setDepth(450);
      }
    }

    await Promise.all(
      discardingContainers.map((container, i) => {
        container.setScale(1.15);
        return waitForTween(scene, {
          targets: container,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
          ease: 'Sine.easeOut',
        }).then(() =>
          waitForTween(scene, {
            targets: container,
            x: centerX + (i - (discardingContainers.length - 1) / 2) * (CARD_W + 20),
            y: centerY,
            alpha: 0,
            scaleX: 0.5,
            scaleY: 0.5,
            duration: 600,
            ease: 'Sine.easeIn',
          }),
        ).then(() => container.destroy());
      }),
    );
  }

  // 注意：弃置导致的清空手牌不再在此自动重摸。
  // 依平衡性规则，清空方将在「获得牌权时」由 GameScene 统一判断并摸满（见 refillIfEmpty）。

  return removed;
}

/**
 * 摸牌到手牌中：从牌堆摸牌，仅对新牌播放入场动画，已有牌不动。
 */
export async function drawCardsToHand(
  scene: Phaser.Scene,
  target: 'player' | 'enemy',
  count: number = 1,
): Promise<Card[]> {
  const { state } = getHandContext(scene, target);

  let deck = state.deck;
  if (deck.length < count) {
    const remaining = deck.splice(0);
    const shuffled = shuffleDeck(state.discardPile);
    state.discardPile.length = 0;
    state.deck = [...shuffled, ...remaining];
    deck = state.deck;
  }

  const drawn: Card[] = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    drawn.push(deck.pop()!);
  }

  state.hand.push(...drawn);
  sortHand(state.hand);

  await insertCardsWithAnimation(scene, target, drawn);

  return drawn;
}

/**
 * 将牌加入手牌（不走牌堆，如剪径抢牌）。
 */
export async function addCardsToHand(
  scene: Phaser.Scene,
  target: 'player' | 'enemy',
  cards: Card[],
): Promise<void> {
  if (cards.length === 0) return;

  const { state } = getHandContext(scene, target);
  state.hand.push(...cards);
  sortHand(state.hand);

  await insertCardsWithAnimation(scene, target, cards);
}

/**
 * 增量插入新牌：已有容器平滑位移到新位置，新牌从屏幕外/中间飞入。
 * 不销毁已有容器，不做全量重建。
 */
async function insertCardsWithAnimation(
  scene: Phaser.Scene,
  target: 'player' | 'enemy',
  newCards: Card[],
): Promise<void> {
  const { state, containers } = getHandContext(scene, target);
  const hand = state.hand;
  const s = gs(scene);
  const { width, height } = scene.scale;

  syncContainerCardData(target, hand, containers);

  const baseY = target === 'player' ? height - 90 : 220;
  const baseDepth = target === 'player' ? 30 : 1;
  const offscreenX = width + CARD_W;

  // 计算所有牌的目标位置
  const totalW = CARD_W + (hand.length - 1) * OVERLAP_OFFSET;
  const startX = (width - totalW) / 2 + CARD_W / 2;

  // 构建旧容器查找表：card identity → container
    const identityMap = new Map<string, Phaser.GameObjects.Container[]>();
    for (const c of containers) {
      const uid = c.getData('uid') as string | undefined;
      if (!uid) continue;
      if (!identityMap.has(uid)) identityMap.set(uid, []);
      identityMap.get(uid)!.push(c);
    }

    const newIdentitySet = new Set<string>();
    for (const card of newCards) {
      newIdentitySet.add(card.uid);
    }

  const usedContainers = new Set<Phaser.GameObjects.Container>();
  const layout: Array<{
    x: number;
    y: number;
    depth: number;
    card: Card;
    container?: Phaser.GameObjects.Container;
    isNew: boolean;
  }> = [];

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    const key = card.uid;
    const targetX = startX + i * OVERLAP_OFFSET;
    const isNew = newIdentitySet.has(key);

    let foundContainer: Phaser.GameObjects.Container | undefined;
    if (!isNew) {
      const pool = identityMap.get(key);
      if (pool) {
        for (const c of pool) {
          if (!usedContainers.has(c)) {
            foundContainer = c;
            usedContainers.add(c);
            break;
          }
        }
      }
    }

    layout.push({
      x: targetX,
      y: baseY,
      depth: baseDepth + i,
      card,
      container: foundContainer,
      isNew: isNew && !foundContainer,
    });
  }

  // 销毁不再使用的旧容器（被弃置等）
  for (const c of containers) {
    if (!usedContainers.has(c)) {
      c.destroy();
    }
  }

  // 更新 containers 引用
  containers.length = 0;
  const tweens: Promise<void>[] = [];

  for (const item of layout) {
    let container: Phaser.GameObjects.Container;

    if (item.container) {
      container = item.container;
    } else {
      if (target === 'player') {
        container = s.createCardDisplay(item.card, offscreenX, item.y, false);
        container.setScale(0);
      } else {
        container = createEnemyCardBackContainer(scene, item.card, offscreenX, item.y);
      }
    }

    container.setDepth(item.depth);
    container.setData('cardIndex', layout.indexOf(item));
    containers.push(container);

    if (item.isNew || item.container) {
      const animTargets: Record<string, number> = {
        x: item.x,
        y: item.y,
      };
      if (item.isNew && target === 'player') {
        animTargets.scaleX = 1;
        animTargets.scaleY = 1;
      }
      if (item.isNew && target === 'enemy') {
        animTargets.alpha = 1;
      }

      tweens.push(
        waitForTween(scene, {
          targets: container,
          ...animTargets,
          duration: 250,
          ease: 'Sine.easeOut',
        }),
      );
    }
  }

  await Promise.all(tweens);
}

function createEnemyCardBackContainer(
  scene: Phaser.Scene,
  _card: Card,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const s = gs(scene);
  const container = s.add.container(x, y);
  container.setAlpha(0);

  const shadowG = scene.add.graphics();
  shadowG.fillStyle(0x1a0a04, 0.25);
  shadowG.fillRoundedRect(-CARD_W / 2 + 5, -CARD_H / 2 + 6, CARD_W, CARD_H, 8);
  container.add(shadowG);

  const cardBack = scene.add.image(0, 0, 'card_back');
  cardBack.setDisplaySize(CARD_W, CARD_H);
  container.add(cardBack);

    container.setData('uid', _card.uid);
    container.setData('rank', _card.rank);
    container.setData('suit', _card.suit ?? '');

    return container;
  }

  /**
   * 将手牌数据同步到容器上，确保后续 identity 匹配正确。
   * 对于 destroy/recreate 渲染产生的容器，rank/suit 可能缺失。
   */
  function syncContainerCardData(
    target: 'player' | 'enemy',
    hand: Card[],
    containers: Phaser.GameObjects.Container[],
  ): void {
    const maxLen = Math.min(hand.length, containers.length);
    for (let i = 0; i < maxLen; i++) {
      const card = hand[i];
      const c = containers[i];
      if (card && c && c.getData('uid') === undefined) {
        c.setData('uid', card.uid);
        c.setData('rank', card.rank);
        c.setData('suit', card.suit ?? '');
      }
    }
  }

/**
 * 弃牌后重新排布已有手牌的位置（不销毁不重建，只位移）。
 * 同时将手牌数据同步到容器上，确保后续增量操作能正确匹配。
 */
function layoutExistingHand(
  scene: Phaser.Scene,
  target: 'player' | 'enemy',
): void {
  const { state, containers } = getHandContext(scene, target);
  const hand = state.hand;
  const { width, height } = scene.scale;

  const baseY = target === 'player' ? height - 90 : 220;
  const baseDepth = target === 'player' ? 30 : 1;

  if (hand.length === 0) return;

  const totalW = CARD_W + (hand.length - 1) * OVERLAP_OFFSET;
  const startX = (width - totalW) / 2 + CARD_W / 2;

  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const targetX = startX + i * OVERLAP_OFFSET;
    const newDepth = baseDepth + i;
    const card = hand[i];

    if (card) {
      container.setData('uid', card.uid);
      container.setData('rank', card.rank);
      container.setData('suit', card.suit ?? '');
    }

    container.setDepth(newDepth);
    container.setData('cardIndex', i);

    scene.tweens.add({
      targets: container,
      x: targetX,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }
}
