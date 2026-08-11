import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForTween, waitForDelay, waitForCounterTween } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';

/**
 * 孙膑「减灶」（发动）：你摸满手牌后，主动选择三张牌弃置。
 * 直到你打完手牌为止，每次你结算伤害时，额外加上这三张牌的总分数。
 *
 * - 发动时机 ON_HAND_REFILLED（玩家手牌打空补满到上限）。
 * - 交互选牌 UI：屏幕中央展示玩家手牌（临时展示，不进入 ctx.centerCardContainers），
 *   点击 toggle 选中（最多 3 张），「确定」弃置 3 张、「取消」不发动。
 * - 弃置为普通弃置（进弃牌堆）；bonus = 三张牌 score 之和，写入 battle.jianzaoBonus /
 *   jianzaoActive。效果周期到玩家打光手牌（handlePostPlayEmptyHandCheck 复位 active）。
 */
export const SunBinJianZao: SkillDefinition = {
  id: 'sunbin_jianzao',
  name: '减灶',
  description: '你摸满手牌后，主动选择三张牌弃置。直到你打完手牌为止，每次你结算伤害时，额外加上这三张牌的总分数',
  timing: SkillTiming.ON_HAND_REFILLED,
  priority: 100,
  dialogLines: ['减灶示弱，骄兵必败。', '今日之弃，乃明日之胜。', '灶减而志不减。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('sunbin')) return false;
    return ctx.battle.player.hand.length >= 3;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const hand = ctx.battle.player.hand;
    if (hand.length < 3) return;

    visuals.playSkillTriggerSound();

    // 交互选牌：返回选中的 3 张牌，取消/不足 3 张返回 null
    const chosen = await pickThreeToDiscard(ctx.gameScene, hand);
    if (!chosen || chosen.length !== 3) return;

    const indices: number[] = [];
    for (const c of chosen) {
      const idx = hand.findIndex(h => h.uid === c.uid);
      if (idx >= 0 && !indices.includes(idx)) indices.push(idx);
    }
    if (indices.length !== 3) return;

    // 普通弃置：从手牌移除并进入弃牌堆
    await discardCardsFromHand(ctx.gameScene, 'player', indices);

    const bonus = chosen.reduce((sum, c) => sum + (c.score ?? c.rank), 0);
    ctx.battle.jianzaoBonus = bonus;
    ctx.battle.jianzaoActive = true;

    await showNotice(ctx.gameScene, `减灶：弃置 3 张，本次手牌周期伤害 +${bonus}`);
  },
};

/**
 * 孙膑「减灶」（加成）：效果生效期间，每次你结算伤害时（所有牌伤害累加完成后、
 * 系数亮出之前），额外加上弃置三张牌的总分数。
 *
 * - 加成时机 ON_DAMAGE_ACCUMULATED（stage1 累加结束、stage2 系数显示之前）。
 * - 只作用于玩家打出的牌结算给敌方（target === 'enemy'）；不加倍、不改系数，
 *   仅增加 damageInfo.sumRanks，并同步更新中央累计伤害计数器显示值（数字跳动动画）。
 * - 绝不 emit 技能事件、绝不 cancelDamageSettlement。
 */
export const SunBinJianZaoBonus: SkillDefinition = {
  id: 'sunbin_jianzao_bonus',
  name: '减灶',
  description: '',
  timing: SkillTiming.ON_DAMAGE_ACCUMULATED,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('sunbin')) return false;
    if (ctx.target !== 'enemy') return false;
    if (!ctx.damageInfo) return false;
    return ctx.battle.jianzaoActive === true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const bonus = ctx.battle.jianzaoBonus;
    if (bonus <= 0 || !ctx.damageInfo) return;

    ctx.damageInfo.sumRanks += bonus;

    visuals.playSkillTriggerSound();

    // 同步更新中央累计伤害计数器显示值（数字跳动动画，参照 stage1 计数器的更新方式）
    const counter = ctx.damageCounterText;
    if (counter) {
      const current = parseInt(counter.text, 10) || 0;
      await waitForCounterTween(ctx.gameScene, {
        from: current,
        to: current + bonus,
        duration: 400,
        ease: 'Cubic.easeOut',
        onUpdate: (val) => counter.setText(`${Math.round(val)}`),
      });
    }

    await showNotice(ctx.gameScene, `减灶：伤害 +${bonus}`);
  },
};

/**
 * 屏幕中央展示玩家手牌并交互选择弃置 3 张（阻塞式等待确定/取消）：
 * - 每张牌可点击选择/取消，最多选 3 张（选中上移 + 金色描边）；
 * - 底部「确定」按钮：选中恰 3 张时 resolve 返回选中牌，否则视为不发动；
 * - 底部「取消」按钮：resolve null（不发动）。
 * 仅临时展示，不进入 ctx.centerCardContainers；所有子元素用局部坐标（相对容器原点）。
 */
async function pickThreeToDiscard(scene: Phaser.Scene, cards: Card[]): Promise<Card[] | null> {
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  const selected = new Set<string>();

  // 手牌可能多达 17 张：紧凑间距居中排布
  const gap = 100;
  const totalW = gap * (cards.length - 1);
  const startX = centerX - totalW / 2;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);

  const title = scene.add.text(0, -CARD_H / 2 - 64, '减灶 · 选择三张牌弃置', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#ffd700',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5);
  overlay.add(title);

  const cardContainers: Phaser.GameObjects.Container[] = [];
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
      } else if (selected.size < 3) {
        selected.add(uid);
        cc.y = -40;
        border.setVisible(true);
      }
    });
    cc.add(zone);

    overlay.add(cc);
    cardContainers.push(cc);
  }

  // 底部按钮 —— 注意：overlay 容器位于 (centerX, centerY)，子元素必须用局部坐标
  const btnY = CARD_H / 2 + 90;
  const btnHalfW = 90;
  const btnGap = 40;

  const confirmBg = scene.add.graphics();
  confirmBg.fillStyle(0x3a1a5a, 1);
  confirmBg.fillRoundedRect(-btnGap / 2 - btnHalfW, btnY - 30, btnHalfW * 2, 60, 8);
  confirmBg.lineStyle(2, 0xffd700, 0.8);
  confirmBg.strokeRoundedRect(-btnGap / 2 - btnHalfW, btnY - 30, btnHalfW * 2, 60, 8);
  overlay.add(confirmBg);

  const confirmText = scene.add.text(-btnGap / 2, btnY, '确 定', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    color: '#ffd700',
    stroke: '#1a0a2a',
    strokeThickness: 2,
  }).setOrigin(0.5);
  overlay.add(confirmText);

  const confirmZone = scene.add.zone(-btnGap / 2, btnY, btnHalfW * 2, 60).setInteractive({ cursor: 'pointer' });
  overlay.add(confirmZone);

  const cancelBg = scene.add.graphics();
  cancelBg.fillStyle(0x3a2a2a, 1);
  cancelBg.fillRoundedRect(btnGap / 2 - btnHalfW, btnY - 30, btnHalfW * 2, 60, 8);
  cancelBg.lineStyle(2, 0xc8a080, 0.8);
  cancelBg.strokeRoundedRect(btnGap / 2 - btnHalfW, btnY - 30, btnHalfW * 2, 60, 8);
  overlay.add(cancelBg);

  const cancelText = scene.add.text(btnGap / 2, btnY, '取 消', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    color: '#c8a080',
    stroke: '#1a0a2a',
    strokeThickness: 2,
  }).setOrigin(0.5);
  overlay.add(cancelText);

  const cancelZone = scene.add.zone(btnGap / 2, btnY, btnHalfW * 2, 60).setInteractive({ cursor: 'pointer' });
  overlay.add(cancelZone);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.5, to: 1 },
    scaleY: { from: 0.5, to: 1 },
    duration: 350,
    ease: 'Back.easeOut',
  });

  // 阻塞等待玩家确定（选满 3 张）或取消
  const result = await new Promise<Card[] | null>(resolve => {
    confirmZone.on('pointerdown', () => {
      if (selected.size === 3) {
        resolve(cards.filter(c => selected.has(c.uid)));
      } else {
        resolve(null);
      }
    });
    cancelZone.on('pointerdown', () => resolve(null));
  });

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    duration: 200,
    ease: 'Sine.easeIn',
    onComplete: () => overlay.destroy(),
  });

  return result;
}

/** 在容器内绘制一张标准牌面（背景/花色/点数/王牌红框），参照张良「运筹」drawCardFace */
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
