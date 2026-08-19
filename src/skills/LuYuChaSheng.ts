import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { cardScoreBoostKey } from '../models/Card';
import { discardCardsFromHand } from '../utils/CardActions';

/**
 * 陆羽「茶圣」（主动技）：每次牌权限一次，你可以弃置任意张梅花牌，
 * 这些梅花牌分数+1。
 *
 * - cardFilter：选中 1 张及以上、且全部为梅花牌；
 * - 执行：对被弃置的梅花牌 `card.score += 1`（**永久生效**，弃置进弃牌堆后
 *   洗回摸回时分数保留），并按卡牌身份键（cardScoreBoostKey）累加
 *   `battle.player.scoreBoosts`，战斗结束由 BattleFlowManager 合并写回
 *   `run.scoreBoosts`，下场战斗 initBattle 对重建的玩家牌组重新应用（跨对局继承）。
 *   与田文「养士」/孙武「练兵」同模式；
 * - 弃空手牌由 ActiveSkillManager.onSkillClick 统一处理（补满 + AI 出牌）。
 */
export const LuYuChaSheng: ActiveSkillDefinition = {
  id: 'luyu_chasheng',
  name: '茶圣',
  description: '（主动技）每次牌权限一次，你可以弃置任意张梅花牌，这些梅花牌分数+1。',
  maxUses: 1,
  ownerCharacterId: 'luyu',
  dialogLines: [
    '不羡黄金罍，不羡白玉杯。',
    '一器成名只为茗，悦来客满是茶香。',
    '茶者，南方之嘉木也。',
  ],

  cardFilter: (selectedCards: Card[]): boolean =>
    selectedCards.length > 0 && selectedCards.every((c) => c.suit === 'club'),

  execute: async (scene, selectedCards) => {
    const hand = scene.getBattle().player.hand;

    const clubCards = selectedCards.filter((c) => c.suit === 'club');
    if (clubCards.length === 0) return;

    const indices = clubCards
      .map((c) => hand.findIndex((h) => h.uid === c.uid))
      .filter((i) => i >= 0);
    if (indices.length !== clubCards.length) return;

    // 永久加分：直接改卡牌对象 + 累加 scoreBoosts（与田文「养士」一致）
    const boosts = (scene.getBattle().player.scoreBoosts ??= {});
    for (const card of clubCards) {
      card.score += 1;
      const key = cardScoreBoostKey(card);
      boosts[key] = (boosts[key] ?? 0) + 1;
    }

    // 弃置（进弃牌堆；分数已保留，洗回摸回仍为加成后分数）
    await discardCardsFromHand(scene, 'player', indices);
    scene.renderPlayerHandAfterSkill();
  },
};
