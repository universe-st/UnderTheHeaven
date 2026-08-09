import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { discardCardsFromHand } from '../utils/CardActions';

/**
 * 魏征「直谏」（主动技）：每次牌权限一次，你可以弃置一张牌（自己的一张手牌）。
 *
 * - requiresSelection 默认 true：需先选中一张牌，选中牌通过 cardFilter 后显示技能按钮。
 * - 重置时机默认（获得牌权时重置）：maxUses 1，每次获得牌权限一次。
 */
export const WeiZhengZhiJian: ActiveSkillDefinition = {
  id: 'weizheng_zhijian',
  name: '直谏',
  description: '（主动技）每次牌权限一次，你可以弃置一张牌（自己的一张手牌）。',
  maxUses: 1,
  ownerCharacterId: 'weizheng',
  dialogLines: [
    '以铜为镜，可以正衣冠；以史为镜，可以知兴替。',
    '兼听则明，偏信则暗。',
    '直言敢谏，虽死不悔！',
  ],

  cardFilter: (selectedCards: Card[]): boolean => selectedCards.length === 1,

  execute: async (scene, selectedCards) => {
    const target = selectedCards[0];
    if (!target) return;

    const hand = scene.getBattle().player.hand;
    // 按 uid 匹配选中牌在手牌中的索引
    const idx = hand.findIndex((c) => c.uid === target.uid);
    if (idx < 0) return;

    // 弃置该牌（进入弃牌堆）
    await discardCardsFromHand(scene, 'player', [idx]);
    scene.renderPlayerHandAfterSkill();
  },
};
