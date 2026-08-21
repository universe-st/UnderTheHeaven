import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { addCardsToHand } from '../utils/CardActions';
import { createPokerCardVisual } from '../utils/CardVisual';
import { waitForTween, waitForDelay, waitForCounterTween } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';

const SUIT_SYMBOL: Record<string, string> = {
  spade: '♠', club: '♣', heart: '♥', diamond: '♦',
};

/** 牌面文案（普通牌：花色+点数；王：虎/龍） */
function cardFaceLabel(card: Card): string {
  return card.suit !== null ? `${SUIT_SYMBOL[card.suit] ?? ''}${card.rankLabel}` : card.rankLabel;
}

/**
 * 孟轲「取义」：你获得牌权时，查看己方牌堆顶的两张牌，
 * 你可以选择获得一张牌，并将另一张牌移除牌库。
 *
 * - 时机 ON_GAIN_TURN（获得牌权时，与张良「运筹」/赵高「指鹿」同时机）。
 * - 仅玩家获得牌权时触发（filter 排除敌方获得牌权的 ON_GAIN_TURN）。
 * - 牌堆顶 = deck 数组末尾（deck.pop() 取顶）；先展示再决定，玩家三选一：
 *   取左牌（获得 + 右牌放逐）/ 取右牌（反之）/ 都不取（两张放回牌堆顶原样）。
 * - 移除牌库 = 放逐：不进弃牌堆、不洗回牌库（从 deck splice 掉即可）。
 * - 选牌 UI 为临时展示（overlay），不进入 ctx.centerCardContainers。
 */
export const MengKeQuYi: SkillDefinition = {
  id: 'mengke_quyi',
  name: '取义',
  description: '你获得牌权时，查看己方牌堆顶的两张牌，你可以选择获得一张牌，并将另一张牌移除牌库',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: [
    '生，亦我所欲也；义，亦我所欲也。',
    '舍生而取义者也。',
    '鱼与熊掌，不可得兼。',
  ],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('mengke')) return false;
    // 仅玩家获得牌权时触发（排除敌方获得牌权的 ON_GAIN_TURN）
    if (ctx.sourceCharacterId === ctx.enemyCharacterId) return false;
    // 牌堆至少两张才能查看牌堆顶两张
    return ctx.battle.player.deck.length >= 2;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const deck = ctx.battle.player.deck;
    if (deck.length < 2) return;

    visuals.playSkillTriggerSound();

    // 牌堆顶两张（deck 末尾）；先展示再决定，此阶段不 splice
    const left = deck[deck.length - 2]!;
    const right = deck[deck.length - 1]!;

    const choice = await chooseFromTopTwo(ctx.gameScene, left, right);

    if (choice === 'left' || choice === 'right') {
      // 取一张：从牌堆移除两张（另一张放逐：不进弃牌堆、不洗回牌库）
      deck.splice(deck.length - 2, 2);
      const gained = choice === 'left' ? left : right;
      await addCardsToHand(ctx.gameScene, 'player', [gained]);
      await showNotice(ctx.gameScene, `取义：获得 ${cardFaceLabel(gained)}，另一张移除牌库`);
    } else {
      // 都不取：两张放回牌堆顶原样（顺序不变，无需操作）
      await showNotice(ctx.gameScene, '取义：两张牌放回牌堆');
    }
  },
};

/** 选择结果：取左牌 / 取右牌 / 都不取 */
type TopTwoChoice = 'left' | 'right' | 'none';

/**
 * 屏幕中央展示牌堆顶两张牌并交互三选一（阻塞式等待）：
 * - 点击左/右牌面，或底部「取左」「取右」按钮 → 对应选择；
 * - 底部「都不要」按钮 → 放回牌堆。
 * 仅临时展示，不进入中央牌区（不 push 进 ctx.centerCardContainers）。
 */
async function chooseFromTopTwo(
  scene: Phaser.Scene,
  left: Card,
  right: Card,
): Promise<TopTwoChoice> {
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  const gap = CARD_W + 60;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);

  const title = scene.add.text(0, -CARD_H / 2 - 64, '取义 · 查看牌堆顶两张', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#ffd700',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5);
  overlay.add(title);

  // 左牌 / 右牌（局部坐标，相对 overlay 原点）
  const leftCard = createPokerCardVisual(scene, left, -gap / 2, 0);
  const rightCard = createPokerCardVisual(scene, right, gap / 2, 0);
  overlay.add(leftCard);
  overlay.add(rightCard);

  const leftZone = scene.add.zone(-gap / 2, 0, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
  overlay.add(leftZone);
  const rightZone = scene.add.zone(gap / 2, 0, CARD_W, CARD_H).setInteractive({ cursor: 'pointer' });
  overlay.add(rightZone);

  // 底部三个按钮（局部坐标；按钮 zone 加入 overlay，随 overlay 一起销毁）
  const btnY = CARD_H / 2 + 110;
  const btnW = 150;
  const btnH = 56;
  const btnGap = 16;
  const btnLabels: Array<{ label: string; choice: TopTwoChoice }> = [
    { label: '取左牌', choice: 'left' },
    { label: '取右牌', choice: 'right' },
    { label: '都不要', choice: 'none' },
  ];
  const btnZones: Array<{ zone: Phaser.GameObjects.Zone; choice: TopTwoChoice }> = [];

  const totalW = btnLabels.length * btnW + (btnLabels.length - 1) * btnGap;
  for (let i = 0; i < btnLabels.length; i++) {
    const bx = -totalW / 2 + i * (btnW + btnGap) + btnW / 2;
    const bg = scene.add.graphics();
    bg.fillStyle(0x3a1a5a, 1);
    bg.fillRoundedRect(bx - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    bg.lineStyle(2, 0xffd700, 0.8);
    bg.strokeRoundedRect(bx - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    overlay.add(bg);

    const label = scene.add.text(bx, btnY, btnLabels[i]!.label, {
      fontSize: '30px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#ffd700',
      stroke: '#1a0a2a',
      strokeThickness: 3,
    }).setOrigin(0.5);
    overlay.add(label);

    const zone = scene.add.zone(bx, btnY, btnW, btnH).setInteractive({ cursor: 'pointer' });
    overlay.add(zone);
    btnZones.push({ zone, choice: btnLabels[i]!.choice });
  }

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.5, to: 1 },
    scaleY: { from: 0.5, to: 1 },
    duration: 350,
    ease: 'Back.easeOut',
  });

  // 阻塞等待玩家三选一（牌面点击或按钮点击均生效）
  const choice = await new Promise<TopTwoChoice>(resolve => {
    const pick = (c: TopTwoChoice) => resolve(c);
    leftZone.on('pointerdown', () => pick('left'));
    rightZone.on('pointerdown', () => pick('right'));
    for (const bz of btnZones) {
      bz.zone.on('pointerdown', () => pick(bz.choice));
    }
  });

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    duration: 200,
    ease: 'Sine.easeIn',
    onComplete: () => overlay.destroy(),
  });

  return choice;
}

/**
 * 孟轲「性善」：你牌库中红色牌比黑色牌每多一张，你计算伤害分数时+5。
 *
 * - 加成时机 ON_DAMAGE_ACCUMULATED（所有牌伤害累加完成后、系数亮出之前，与
 *   孙膑「减灶」加成同时机），只作用于玩家打出的牌结算给敌方（target === 'enemy'）。
 * - 实时数己方牌堆红黑数：红 = heart/diamond，黑 = spade/club，王（suit null）不计；
 *   diff = 红数 - 黑数，diff > 0 时 sumRanks += diff * 5，并同步更新中央累计
 *   伤害计数器显示值（数字跳动动画）。
 * - 绝不 emit 技能事件、绝不 cancelDamageSettlement。
 */
export const MengKeXingShan: SkillDefinition = {
  id: 'mengke_xingshan',
  name: '性善',
  description: '你牌库中红色牌比黑色牌每多一张，你计算伤害分数时+5',
  timing: SkillTiming.ON_DAMAGE_ACCUMULATED,
  priority: 100,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes('mengke')) return false;
    if (ctx.target !== 'enemy') return false;
    return !!ctx.damageInfo;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    if (!ctx.damageInfo) return;

    // 实时数己方牌堆红黑数（王 suit 为 null 不计）
    let red = 0;
    let black = 0;
    for (const c of ctx.battle.player.deck) {
      if (c.suit === 'heart' || c.suit === 'diamond') red += 1;
      else if (c.suit === 'spade' || c.suit === 'club') black += 1;
    }
    const diff = red - black;
    if (diff <= 0) return;

    const bonus = diff * 5;
    ctx.damageInfo.sumRanks += bonus;

    visuals.playSkillTriggerSound();

    // 同步更新中央累计伤害计数器显示值（数字跳动动画，参照减灶加成）
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

    await showNotice(ctx.gameScene, `性善：伤害 +${bonus}`);
  },
};

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
