import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import type { BattleState } from '../models/BattleTypes';
import { discardCardsFromHand } from '../utils/CardActions';
import { SkillVisualManagerImpl } from './SkillVisualManagerImpl';

/** SkillVisualManagerImpl 需要的宿主场景接口（GameScene 结构兼容） */
interface SceneHandle {
  battle: BattleState;
  updateVitalityBars(): void;
  cancelDamageSettlement(gainTurn?: boolean): void;
  updateCharacterMarker(characterId: string, count: number): void;
  markCharacterLost(characterId: string): void;
  showDialog(characterId: string, text: string): void;
}

/**
 * 伊尹「至味」（主动技）：每次牌权限一次，弃置四张有花色且花色不同的牌
 * （即 ♠♣♥♦ 四种花色各一张，大小王无花色不可选），恢复等同于分数之和的气数。
 * 分数（score）与点数（rank）独立：初始相等，技能可单独修改分数不影响点数，治疗按当前分数计算。
 *
 * - cardFilter：恰好 4 张、均有花色、花色互不相同；
 * - 执行：弃置（进弃牌堆，带飞入动画）→ 治疗（复用 showHeal：clamp 上限 + 数字动画 + 音效 + 血条刷新）；
 * - 弃空手牌由 ActiveSkillManager.onSkillClick 统一处理（补满 + AI 出牌）。
 */
export const YiYinZhiWei: ActiveSkillDefinition = {
  id: 'yiyin_zhiwei',
  name: '至味',
  description: '（主动技）每次牌权限一次，弃置四张有花色且花色不同的牌，恢复等同于分数之和的气数',
  maxUses: 1,
  ownerCharacterId: 'yiyin',
  dialogLines: [
    '治大国若烹小鲜。',
    '五味调和，方成至味。',
    '鼎中之变，精妙微纤。',
  ],

  cardFilter: (selectedCards: Card[]): boolean => {
    if (selectedCards.length !== 4) return false;
    if (!selectedCards.every((c) => c.suit !== null)) return false;
    return new Set(selectedCards.map((c) => c.suit)).size === 4;
  },

  execute: async (scene, selectedCards) => {
    const hand = scene.getBattle().player.hand;
    const indices = selectedCards
      .map((c) => hand.findIndex((h) => h.uid === c.uid))
      .filter((i) => i >= 0);
    if (indices.length !== 4) return;

    const heal = selectedCards.reduce((sum, c) => sum + c.score, 0);

    await discardCardsFromHand(scene, 'player', indices);

    // 治疗：复用公共治疗显示（clamp 上限 + 数字动画 + 音效 + 血条刷新）
    const visuals = new SkillVisualManagerImpl(scene as unknown as Phaser.Scene & SceneHandle);
    visuals.showHeal('player', heal);

    scene.renderPlayerHandAfterSkill();
  },
};
