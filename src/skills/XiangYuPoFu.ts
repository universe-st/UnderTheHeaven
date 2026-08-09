import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { identifyHand } from '../engine/HandRecognizer';
import { getCoefficient } from '../engine/DamageCalculator';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForTween } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_DAMAGE } from '../constants/Layout';

/**
 * 项羽「破釜」（主动技）：气数足够时可发动，失去30%的气数，弃置任意合法牌型
 * 直接对对方造成十倍分数乘以牌型系数的伤害。
 *
 * - 不走正常打牌伤害结算流程（不 emit 任何 SkillTiming 事件），
 *   其他角色针对卡牌的增伤/系数技能均不生效 —— 这是技能设计核心。
 * - cardFilter：选中牌是合法牌型（identifyHand !== null）；
 *   "气数足够"：有气数（vitality > 0）才能发动，扣 30% 后仍 > 0 自然满足。
 * - 直伤计算：sumRanks = 各牌 rank 之和；damage = round(10 × sumRanks × coeff)，
 *   coeff = getCoefficient(pattern.type, pattern.length)。
 */
export const XiangYuPoFu: ActiveSkillDefinition = {
  id: 'xiangyu_pofu',
  name: '破釜',
  description: '（主动技）每次牌权限一次。气数足够时可发动，失去30%的气数，弃置任意合法牌型直接对对方造成十倍分数乘以牌型系数的伤害。',
  maxUses: 1,
  ownerCharacterId: 'xiangyu',
  dialogLines: [
    '破釜沉舟，百二秦关终属楚！',
    '力拔山兮气盖世！',
    '今日之战，有进无退！',
  ],

  cardFilter: (selectedCards: Card[]): boolean => identifyHand(selectedCards) !== null,

  // 气数足够才能发动：扣 30% 后仍 > 0（vitality=1 时扣 ceil(0.3)=1 会归零，不可发动）。
  // 按钮仅在气数足够时显示；点击时 onSkillClick 也会再次校验，气数不足不消耗次数。
  canUseWithSelection: (scene, _selectedCards): boolean => {
    const vitality = scene.getBattle().player.vitality;
    return vitality - Math.ceil(vitality * 0.3) > 0;
  },

  execute: async (scene, selectedCards) => {
    const battle = scene.getBattle();
    const pattern = identifyHand(selectedCards);
    if (!pattern) return;

    // 失去当前气数的 30%（向上取整）；"气数足够" = 扣除后仍 > 0（气数不足无法发动）
    const cost = Math.ceil(battle.player.vitality * 0.3);
    if (battle.player.vitality - cost <= 0) return;
    battle.player.vitality -= cost;

    // 弃置选中的牌（按 uid 匹配手牌索引，进入弃牌堆）
    const hand = battle.player.hand;
    const indices = selectedCards
      .map((c) => hand.findIndex((h) => h.uid === c.uid))
      .filter((i) => i >= 0);
    if (indices.length > 0) {
      await discardCardsFromHand(scene, 'player', indices);
    }

    // 直伤计算：十倍分数 × 牌型系数（不走正常伤害结算流程）
    const sumRanks = pattern.cards.reduce((sum, c) => sum + c.rank, 0);
    const coeff = getCoefficient(pattern.type, pattern.length);
    const damage = Math.round(10 * sumRanks * coeff);

    // 直接扣对方气数 + 血条动画（通过 GameScene 公开方法）
    const gs = scene as unknown as {
      animateHealthBarDepletionAsync(
        target: 'enemy' | 'player',
        newVitality: number,
        duration: number,
      ): Promise<void>;
      showGameOver(win: boolean): void;
    };
    const newVitality = Math.max(0, battle.enemy.vitality - damage);
    battle.enemy.vitality = newVitality;
    if (typeof gs.animateHealthBarDepletionAsync === 'function') {
      await gs.animateHealthBarDepletionAsync('enemy', newVitality, 300);
    }

    // 屏幕中央显示伤害数字（参照 DamageSettlementManager counterText 风格）
    await showDamageNumber(scene, damage);

    // 敌方死亡判定
    if (battle.enemy.vitality <= 0 && typeof gs.showGameOver === 'function') {
      gs.showGameOver(true);
    }
  },
};

/** 屏幕中央展示 -N 伤害数字后淡出销毁 */
async function showDamageNumber(scene: Phaser.Scene, damage: number): Promise<void> {
  const { width, height } = scene.scale;
  const t = scene.add.text(width / 2, height / 2, `-${damage}`, {
    fontSize: '88px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#dd3300',
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
    y: t.y - 60,
    duration: 500,
    ease: 'Sine.easeIn',
    onComplete: () => t.destroy(),
  });
}
