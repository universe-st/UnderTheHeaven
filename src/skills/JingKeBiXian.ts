import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { Card } from '../models/Card';
import { createPokerCardVisual } from '../utils/CardVisual';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';

/**
 * 荆轲「匕现」：敌方打出的牌进行伤害结算，且结算到最后一张牌时，
 * 你进行一次判定，若花色与该牌相同，你对敌方造成此牌分数30倍的伤害，
 * 对方结束伤害结算，你获得牌权。
 *
 * - 时机 ON_SINGLE_CARD_SETTLEMENT + singleCard.isLastCard：敌方结算逐牌揭示到最后一
 *   张时触发（单张牌型即第一张 = 最后一张）。
 * - 判定机制与庄周「逍遥」一致：从己方牌库随机抽一张亮出展示，判定后放入己方弃牌堆。
 * - 花色相同（含王与王，suit 均为 null）：对敌方造成「最后一张牌分数 × 30」的伤害
 *   （血条递减 + 敌方侧 -N 数字，参照项羽「破釜」），随后 cancelDamageSettlement(true)
 *   结束伤害结算并令玩家获得牌权；若反伤击杀敌方，调用 showGameOver(true)。
 * - 花色不同：仅提示，伤害照常结算（不取消）。
 */
export const JingKeBiXian: SkillDefinition = {
  id: 'jingke_bixian',
  name: '匕现',
  description: '敌方打出的牌进行伤害结算，且结算到最后一张牌时，你进行一次判定，若花色与该牌相同，你对敌方造成此牌分数30倍的伤害，对方结束伤害结算，你获得牌权',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  priority: 100,
  dialogLines: ['图穷而匕见！', '风萧萧兮易水寒，壮士一去兮不复还！', '一击必中！'],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'player') return false;
    if (!ctx.playerCharacterIds.includes('jingke')) return false;
    if (!ctx.singleCard) return false;
    // 仅「结算到最后一张牌」时判定
    if (!ctx.singleCard.isLastCard) return false;
    // 牌库有牌才能判定；牌库为空时不触发，伤害照常结算
    return ctx.battle.player.deck.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = ctx.gameScene;
    const deck = ctx.battle.player.deck;
    if (deck.length === 0 || !ctx.singleCard) return;

    visuals.playSkillTriggerSound();
    await waitForDelay(scene, 100);

    // 判定：从己方牌库随机抽一张亮出（庄周「逍遥」同款机制）
    const idx = Math.floor(Math.random() * deck.length);
    const [judgedCard] = deck.splice(idx, 1);
    if (!judgedCard) return;

    await showJudgedCard(scene, judgedCard);
    // 判定后牌放进己方弃牌堆
    ctx.battle.player.discardPile.push(judgedCard);

    // 最后一张结算牌的花色（当前中央牌容器；王为 null）
    const lastCardSuit = ctx.singleCard.card.getData('suit') as Card['suit'];
    if (judgedCard.suit !== lastCardSuit) {
      await showNotice(scene, '匕现：花色不同，功亏一篑', '#e8a040');
      return;
    }

    // 花色相同：对敌方造成「此牌分数 × 30」的伤害
    const lastCardScore = ctx.singleCard.baseScore;
    const damage = lastCardScore * 30;

    await showNotice(scene, `匕现：花色相同！造成 ${damage} 点伤害！`, '#ff4444');

    const gs = scene as unknown as {
      animateHealthBarDepletionAsync(
        target: 'enemy' | 'player',
        newVitality: number,
        duration: number,
      ): Promise<void>;
      showGameOver(win: boolean): void;
    };
    const enemyNew = Math.max(0, ctx.battle.enemy.vitality - damage);
    ctx.battle.enemy.vitality = enemyNew;
    if (typeof gs.animateHealthBarDepletionAsync === 'function') {
      await gs.animateHealthBarDepletionAsync('enemy', enemyNew, 400);
    }
    await showDamageNumber(scene, damage);

    const enemyDead = ctx.battle.enemy.vitality <= 0;

    // 对方结束伤害结算，你获得牌权（同张飞「断喝」，cancelDamageSettlement(true)）
    visuals.cancelDamageSettlement(true);

    // 反伤击杀敌方：显示胜利（须在 cancel 之后，最终 phase 为 game_over，
    // BattleFlowManager 的三处取消检查已兼容 game_over 提前返回）
    if (enemyDead && typeof gs.showGameOver === 'function') {
      gs.showGameOver(true);
    }
  },
};

/** 屏幕中央亮出一张判定牌（缩放飞入 → 停留 → 淡出销毁），仅预览不进入中央牌区 */
async function showJudgedCard(scene: Phaser.Scene, card: Card): Promise<void> {
  const { width, height } = scene.scale;
  const overlay = scene.add.container(width / 2, height / 2).setDepth(999).setAlpha(0);

  const label = scene.add.text(0, -CARD_H / 2 - 34, '判 定', {
    fontSize: '30px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#ffd700',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5);
  overlay.add(label);

  // 使用与手牌区完全相同的卡面样式（createPokerCardVisual）
  const cc = createPokerCardVisual(scene, card, 0, 0);
  overlay.add(cc);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.3, to: 1 },
    scaleY: { from: 0.3, to: 1 },
    duration: 400,
    ease: 'Back.easeOut',
  });

  await waitForDelay(scene, 1200);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    y: overlay.y - 60,
    duration: 300,
    ease: 'Sine.easeIn',
    onComplete: () => overlay.destroy(),
  });
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

/** 敌方血条上方展示 -N 反伤数字后淡出销毁（参照项羽「破釜」showDamageNumber） */
async function showDamageNumber(scene: Phaser.Scene, amount: number): Promise<void> {
  const { width, height } = scene.scale;
  const y = 220;

  const t = scene.add.text(width / 2, y, `-${amount}`, {
    fontSize: '88px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#dd3300',
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT).setAlpha(0);

  await waitForTween(scene, {
    targets: t,
    alpha: 1,
    scaleX: 1.2,
    scaleY: 1.2,
    duration: 200,
    ease: 'Back.easeOut',
  });
  await waitForTween(scene, {
    targets: t,
    alpha: 0,
    y: y - 60,
    duration: 500,
    ease: 'Sine.easeIn',
    onComplete: () => t.destroy(),
  });
}
