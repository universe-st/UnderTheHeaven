import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { identifyHand } from '../engine/HandRecognizer';
import { getCoefficient } from '../engine/DamageCalculator';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForTween } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_DAMAGE } from '../constants/Layout';

/**
 * 项羽「破釜」（主动技）：弃置任意合法牌型，扣减自身「分数总和×牌型系数」的气数，
 * 对对方造成两倍（分数总和×牌型系数）的伤害。若自身气数无法承担扣减则无法发动。
 *
 * - 不走正常打牌伤害结算流程（不 emit 任何 SkillTiming 事件），
 *   其他角色针对卡牌的增伤/系数技能均不生效 —— 这是技能设计核心。
 * - cardFilter：选中牌是合法牌型（identifyHand !== null）；
 *   发动门槛：扣减后自身气数仍 > 0（vitality - cost > 0），气数无法承担扣减则无法发动。
 * - 数值：sumRanks = 各牌 rank 之和；coeff = getCoefficient(pattern.type, pattern.length)；
 *   cost = round(sumRanks × coeff)（自身扣减的气数）；damage = cost × 2（对对方造成的两倍伤害）。
 * - 动画：先弃牌（discardCardsFromHand 飞入弃牌堆动画），再扣减自身气数（血条递减 + 玩家侧 -cost 数字），
 *   最后对对方造成伤害（血条递减 + 敌方侧 -damage 数字）。
 */
export const XiangYuPoFu: ActiveSkillDefinition = {
  id: 'xiangyu_pofu',
  name: '破釜',
  description: '（主动技）每个牌权限一次，你可以弃置任意合法牌型，扣减自身分数总和乘以牌型系数的气数给对方造成两倍伤害。如果你的气数无法承担扣减则无法发动。',
  maxUses: 1,
  ownerCharacterId: 'xiangyu',
  dialogLines: [
    '破釜沉舟，百二秦关终属楚！',
    '力拔山兮气盖世！',
    '今日之战，有进无退！',
  ],

  cardFilter: (selectedCards: Card[]): boolean => identifyHand(selectedCards) !== null,

  // 扣减后自身气数必须仍 > 0（气数无法承担扣减则无法发动）。按钮仅在气数足够时显示；
  // 点击时 onSkillClick 也会再次校验，气数不足不消耗次数。
  canUseWithSelection: (scene, selectedCards): boolean => {
    const pattern = identifyHand(selectedCards);
    if (!pattern) return false;
    const cost = calcCost(pattern);
    return scene.getBattle().player.vitality - cost > 0;
  },

  execute: async (scene, selectedCards) => {
    const battle = scene.getBattle();
    const pattern = identifyHand(selectedCards);
    if (!pattern) return;

    const cost = calcCost(pattern);
    const damage = cost * 2;
    // 气数无法承担扣减（扣完 ≤ 0）则无法发动
    if (battle.player.vitality - cost <= 0) return;

    // 弃置选中的牌（按 uid 匹配手牌索引，进入弃牌堆，带飞入动画）
    const hand = battle.player.hand;
    const indices = selectedCards
      .map((c) => hand.findIndex((h) => h.uid === c.uid))
      .filter((i) => i >= 0);
    if (indices.length > 0) {
      await discardCardsFromHand(scene, 'player', indices);
    }

    const gs = scene as unknown as {
      animateHealthBarDepletionAsync(
        target: 'enemy' | 'player',
        newVitality: number,
        duration: number,
      ): Promise<void>;
      showGameOver(win: boolean): void;
    };

    // ① 扣减自身气数：血条递减动画 + 玩家侧显示 -cost
    const playerNew = Math.max(0, battle.player.vitality - cost);
    battle.player.vitality = playerNew;
    if (typeof gs.animateHealthBarDepletionAsync === 'function') {
      await gs.animateHealthBarDepletionAsync('player', playerNew, 400);
    }
    await showDamageNumber(scene, cost, 'player');

    // ② 对对方造成两倍伤害：血条递减动画 + 敌方侧显示 -damage
    const enemyNew = Math.max(0, battle.enemy.vitality - damage);
    battle.enemy.vitality = enemyNew;
    if (typeof gs.animateHealthBarDepletionAsync === 'function') {
      await gs.animateHealthBarDepletionAsync('enemy', enemyNew, 400);
    }
    await showDamageNumber(scene, damage, 'enemy');

    // 敌方死亡判定
    if (battle.enemy.vitality <= 0 && typeof gs.showGameOver === 'function') {
      gs.showGameOver(true);
    }
  },
};

/** 破釜扣减自身的气数：round(分数总和 × 牌型系数) */
function calcCost(pattern: NonNullable<ReturnType<typeof identifyHand>>): number {
  const sumRanks = pattern.cards.reduce((sum, c) => sum + c.rank, 0);
  const coeff = getCoefficient(pattern.type, pattern.length);
  return Math.round(sumRanks * coeff);
}

/**
 * 屏幕侧边展示 -N 伤害/扣减数字后淡出销毁（参照 DamageSettlementManager counterText 风格）。
 * @param side 'player' = 玩家血条上方（自身扣减），'enemy' = 敌方血条下方（对敌伤害）。
 */
async function showDamageNumber(
  scene: Phaser.Scene,
  amount: number,
  side: 'player' | 'enemy',
): Promise<void> {
  const { width, height } = scene.scale;
  const y = side === 'player' ? height - 280 : 220;
  const color = side === 'player' ? '#e8a040' : '#dd3300';

  const t = scene.add.text(width / 2, y, `-${amount}`, {
    fontSize: '88px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color,
    stroke: '#1a0800',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(DEPTH_DAMAGE).setAlpha(0);

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
