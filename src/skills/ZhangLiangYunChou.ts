import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { addCardsToHand } from '../utils/CardActions';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';

/**
 * 张良「运筹」：获得牌权时，从牌堆随机抽五张牌，选择最多两张获得，剩余的牌弃置。
 *
 * - 时机 ON_GAIN_TURN（获得牌权时，与诸葛亮「先算」/赵高「指鹿」同时机）。
 * - 执行：从己方牌库随机抽 5 张（deck 不足 5 张时有多少抽多少），屏幕中央展示，
 *   玩家点击选择最多 2 张（选中上移 + 金色描边），点「确定」后：
 *   选中的牌加入手牌（addCardsToHand），未选的牌弃置（进入弃牌堆）。
 * - 选牌 UI 是阻塞式等待：Promise 包裹，点击确定时 resolve。
 * - 抽出的牌已从 deck splice 出（临时持有在技能局部变量），选完确定后按上述逻辑分配。
 */
export const ZhangLiangYunChou: SkillDefinition = {
  id: 'zhangliang_yunchou',
  name: '运筹',
  description: '获得牌权时，从牌堆随机抽五张牌，选择最多两张获得，剩余的牌弃置',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: [
    '运筹帷幄之中，决胜千里之外。',
    '谋定而后动，知止而有得。',
    '明修栈道，暗度陈仓。',
  ],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('zhangliang')) return false;
    // 仅玩家获得牌权时触发（排除敌方获得牌权的 ON_GAIN_TURN，与赵高「指鹿」一致）
    if (ctx.sourceCharacterId === ctx.enemyCharacterId) return false;
    // 牌堆有牌才能抽
    return ctx.battle.player.deck.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const deck = ctx.battle.player.deck;
    if (deck.length === 0) return;

    visuals.playSkillTriggerSound();

    // 从牌堆随机抽 5 张（deck 不足 5 张时有多少抽多少）
    const count = Math.min(5, deck.length);
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * deck.length);
      drawn.push(deck.splice(idx, 1)[0]!);
    }

    // 交互选牌：屏幕中央展示，最多选 2 张，点「确定」后返回选中牌的 uid 集合
    const chosenUids = await pickCardsToKeep(ctx.gameScene, drawn);

    const chosen = drawn.filter((c) => chosenUids.has(c.uid));
    const remaining = drawn.filter((c) => !chosenUids.has(c.uid));

    if (chosen.length > 0) {
      // 选中的牌获得（加入手牌，自带飞入动画）
      await addCardsToHand(ctx.gameScene, 'player', chosen);
    }
    if (remaining.length > 0) {
      // 未选的牌弃置（进入己方弃牌堆）
      ctx.battle.player.discardPile.push(...remaining);
    }

    await showNotice(
      ctx.gameScene,
      chosen.length > 0 ? `运筹：获得 ${chosen.length} 张牌` : '运筹：抽牌全部弃置',
    );
  },
};

/**
 * 屏幕中央展示抽出的牌并交互选择（阻塞式等待确定）：
 * - 每张牌可点击选择/取消，最多选 2 张（选中牌上移 + 金色描边）；
 * - 底部「确定」按钮，点击后 resolve 返回选中牌的 uid 集合。
 * 仅临时展示，不进入中央牌区（不 push 进 ctx.centerCardContainers）。
 */
async function pickCardsToKeep(scene: Phaser.Scene, cards: Card[]): Promise<Set<string>> {
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  const selected = new Set<string>();

  const gap = CARD_W + 60;
  const totalW = gap * (cards.length - 1);
  const startX = centerX - totalW / 2;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);

  const title = scene.add.text(0, -CARD_H / 2 - 64, '运筹帷幄 · 选择最多两张牌', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#ffd700',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5);
  overlay.add(title);

  for (let i = 0; i < cards.length; i++) {
    const cc = scene.add.container(startX - centerX + i * gap, 0);
    drawCardFace(scene, cc, cards[i]!);

    // 选中金框（默认隐藏）
    const border = scene.add.graphics();
    border.lineStyle(4, 0xffd700, 1);
    border.strokeRoundedRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10, 10);
    border.setVisible(false);
    cc.add(border);

    // 点击选择/取消
    const zone = scene.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
    zone.on('pointerdown', () => {
      const uid = cards[i]!.uid;
      if (selected.has(uid)) {
        selected.delete(uid);
        cc.y = 0;
        border.setVisible(false);
      } else if (selected.size < 2) {
        selected.add(uid);
        cc.y = -40;
        border.setVisible(true);
      }
    });
    cc.add(zone);

    overlay.add(cc);
  }

  // 底部「确定」按钮 —— 注意：overlay 容器位于 (centerX, centerY)，子元素必须用
  // 局部坐标（相对容器原点），否则会渲染到屏幕外（4.8 容器缩放原点陷阱同类问题）
  const btnY = CARD_H / 2 + 90;
  const confirmBg = scene.add.graphics();
  confirmBg.fillStyle(0x3a1a5a, 1);
  confirmBg.fillRoundedRect(-70, btnY - 30, 140, 60, 8);
  confirmBg.lineStyle(2, 0xffd700, 0.8);
  confirmBg.strokeRoundedRect(-70, btnY - 30, 140, 60, 8);
  overlay.add(confirmBg);

  const confirmText = scene.add.text(0, btnY, '确 定', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    color: '#ffd700',
    stroke: '#1a0a2a',
    strokeThickness: 2,
  }).setOrigin(0.5);
  overlay.add(confirmText);

  const confirmZone = scene.add.zone(0, btnY, 140, 60).setInteractive({ cursor: 'pointer' });
  overlay.add(confirmZone);  // 加入容器（局部坐标），随 overlay 一起销毁

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.5, to: 1 },
    scaleY: { from: 0.5, to: 1 },
    duration: 350,
    ease: 'Back.easeOut',
  });

  // 阻塞等待玩家点击确定
  await new Promise<void>(resolve => {
    confirmZone.on('pointerdown', () => resolve());
  });

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    duration: 200,
    ease: 'Sine.easeIn',
    onComplete: () => overlay.destroy(),
  });

  return selected;
}

/** 在容器内绘制一张标准牌面（背景/花色/点数/王牌红框），参照周处「除害」drawCardFace */
function drawCardFace(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  card: Card,
): void {
  const cardBg = scene.add.graphics();
  cardBg.fillStyle(0xf5f0e0, 1);
  cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  cardBg.lineStyle(2, 0x8a6030, 0.8);
  cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  container.add(cardBg);

  const suitSymbols: Record<string, string> = {
    spade: '♠', club: '♣', heart: '♥', diamond: '♦',
  };
  const suitSymbol = card.suit ? (suitSymbols[card.suit] ?? '') : '';
  const topColor = card.suit === 'heart' || card.suit === 'diamond' ? '#c04040' : '#1a1a1a';

  const smallSuit = scene.add.text(-CARD_W / 2 + 10, -CARD_H / 2 + 8, suitSymbol, {
    fontSize: '22px',
    fontFamily: FONT_FAMILY,
    color: topColor,
  });
  container.add(smallSuit);

  const rankText = scene.add.text(0, 0, card.rankLabel, {
    fontSize: '64px',
    fontFamily: FONT_FAMILY,
    color: '#2a1008',
    stroke: '#ffd700',
    strokeThickness: 3,
  }).setOrigin(0.5);
  container.add(rankText);

  if (card.suit === null) {
    const ring = scene.add.graphics();
    ring.lineStyle(3, 0xdd3300, 0.9);
    ring.strokeRoundedRect(-CARD_W / 2 + 4, -CARD_H / 2 + 4, CARD_W - 8, CARD_H - 8, 6);
    container.add(ring);
  }
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
