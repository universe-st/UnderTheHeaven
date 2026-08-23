import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';
import { getRun } from '../models/RunManager';

const LI_LI = 'lili';
type Suit = NonNullable<Card['suit']>;

/** 屏幕中部提示文字（浮现 → 停留 → 上浮淡出） */
async function showNotice(
  scene: Phaser.Scene,
  text: string,
  color = '#c84030',
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

/** 花色符号 */
function suitLabel(suit: Suit): string {
  switch (suit) {
    case 'spade': return '♠';
    case 'club': return '♣';
    case 'heart': return '♥';
    case 'diamond': return '♦';
  }
}

/**
 * 李离「伏剑」（主动技）：每次牌权限一次，你可以展示一张和「尊法」弃置的牌
 * 相同点数和花色的手牌，然后你将所有该花色的牌移除牌库，并移除本角色。
 * 在之后的所有对局中，对方该花色的牌结算伤害永不计分。
 *
 * - 前置条件：本局「尊法」至少触发过一次（battle.liliZunfaTriggered === true），
 *   否则不可发动（canUseWithSelection 拦截，按钮不显示）。
 * - 「展示一张自己的手牌」：主动技选 1 张手牌，需与尊法弃牌同点（rank）同花色（suit）。
 *   玩家侧经 cardFilter + canUseWithSelection 双拦截；防御性兜底取手牌中第一张匹配牌。
 * - 移除范围（用户确认）：移除李离手牌中与该牌同花色的所有牌，并将玩家牌库
 *   （牌堆 draw pile + 弃牌堆 discard pile）中该花色的所有牌移除牌库（不再进任何牌堆）；
 *   李离自己手上的同花色牌也一并移除。敌方牌库每场战斗重建、无需处理。
 * - 随后移除本角色：lostCharacters + markCharacterLost + 离队提示动画（海瑞「谏疏」范式）。
 * - 永久规则（用户坚持跨局永久）：把该花色写入 run.permanentSuitBans（跨局持久化，
 *   参照 characterMarkers / scoreBoosts 的写回+读入机制），并同步注入 battle.permanentSuitBans
 *   （本场立即生效）。李离移除后、后续所有对局中敌方该花色结算伤害永不计分：
 *   GameScene.initBattle 每场从 run.permanentSuitBans 注入 battle.permanentSuitBans，
 *   DamageSettlementManager 单牌结算管线（target==='player' + suit 命中）强制归零，
 *   脱离李离在场可靠生效；李离在场时 LiLiFuJianBan 隐藏技（priority 200）先行归零播动画。
 */
export const LiLiFuJian: ActiveSkillDefinition = {
  id: 'lili_fujian',
  name: '伏剑',
  description: '（主动技）每次牌权限一次，你可以展示一张和「尊法」弃置的牌相同点数和花色的手牌，然后你将所有该花色的牌移除牌库，并移除本角色。在之后的所有对局中，对方该花色的牌结算伤害永不计分。',
  maxUses: 1,
  ownerCharacterId: LI_LI,
  dialogLines: ['过听杀人，罪当死。', '理有法，失刑则刑，失死则死。'],

  // 宽松通过：是否与尊法弃牌同点同花色由 canUseWithSelection（可访问 scene）判定
  cardFilter: (selectedCards: Card[]): boolean => {
    return selectedCards.length === 1;
  },

  canUseWithSelection: (scene, selectedCards): boolean => {
    const battle = scene.getBattle();
    // 前置条件：尊法至少触发过一次
    if (!battle.liliZunfaTriggered) return false;
    const targetSuit = battle.liliZunfaSuit;
    const targetRank = battle.liliZunfaRank;
    // 大小王（suit null）无花色，不可作为「同花色」目标
    if (targetSuit === undefined || targetSuit === null || targetRank === undefined) return false;
    const card = selectedCards[0];
    if (!card) return false;
    return card.suit === targetSuit && card.rank === targetRank;
  },

  execute: async (scene, selectedCards) => {
    const battle = scene.getBattle();
    const targetSuitRaw = battle.liliZunfaSuit;
    const targetRank = battle.liliZunfaRank;
    // 大小王（suit null）无花色，无法作为「同花色」目标
    if (targetSuitRaw === null || targetSuitRaw === undefined || targetRank === undefined) return;
    const targetSuit: Suit = targetSuitRaw;

    const hand = battle.player.hand;

    // 确定被展示的牌（玩家侧已被 canUse 拦截；防御性兜底找匹配牌）
    let chosen = selectedCards[0];
    if (!chosen || hand.findIndex(h => h.uid === chosen!.uid) < 0) {
      const fallback = hand.find(c => c.suit === targetSuit && c.rank === targetRank);
      if (!fallback) return;
      chosen = fallback;
    }

    // 展示一张手牌
    await showNotice(scene, `伏剑 · 展示 ${suitLabel(targetSuit)}${chosen.rankLabel}`);

    // 1) 移除玩家手牌中所有同花色牌（弃置进弃牌堆后一并移出牌库）
    const suitIndices = hand
      .map((c, i) => ({ c, i }))
      .filter(x => x.c.suit === targetSuit)
      .map(x => x.i);
    if (suitIndices.length > 0) {
      await discardCardsFromHand(scene, 'player', suitIndices);
    }
    // 2) 玩家弃牌堆 / 牌堆中同花色牌移出牌库（不再进任何牌堆）
    battle.player.discardPile = battle.player.discardPile.filter(c => c.suit !== targetSuit);
    battle.player.deck = battle.player.deck.filter(c => c.suit !== targetSuit);

    // 3) 永久禁分花色：写入对局存档（跨局）+ 注入本场 battle（立即生效）
    const run = getRun();
    const existingBans = (run?.permanentSuitBans ?? []).filter(
      (s): s is Suit => s !== null && s !== undefined,
    );
    const bans = new Set<Suit>(existingBans);
    bans.add(targetSuit);
    if (run) run.permanentSuitBans = [...bans];
    battle.permanentSuitBans = [...bans];

    // 4) 移除本角色
    battle.player.lostCharacters = [...(battle.player.lostCharacters ?? []), LI_LI];
    await showNotice(scene, '李离伏剑殉法，离开队伍！');

    scene.renderPlayerHandAfterSkill();
  },
};
