import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForDelay } from '../utils/AnimationUtils';
import type { PlayerCharacterId } from '../models/Character';

const LI_LI: PlayerCharacterId = 'lili';

/**
 * 李离「尊法」（触发技）：你获得牌权时，若对方有手牌，你弃置对方一张手牌。
 * 直到本圈结束前，其不能打出相同花色的牌。
 *
 * - 时机 ON_GAIN_TURN（玩家获得牌权广播）：
 *   - 排除敌方获得牌权的 ON_GAIN_TURN（aiInitiatePlay 中 sourceCharacterId 为敌方）——
 *     否则敌方回合也触发、弃自己手牌；
 *   - 「若对方有手牌」：条件是对方（enemy）有手牌，而非己方。
 * - 弃置敌方一张手牌：弃置分数最低的一张（保留高价值牌，参照孙膑「减灶」aiPick 思路）。
 * - 记录被弃牌的花色 battle.liliZunfaSuit 并置 battle.liliZunfaTriggered = true（伏剑前置条件）。
 *   「本圈内对方不能打出该花色」由 AIBrain 出牌决策的 liliZunfaBlockedSuit 拦截实现
 *   （aiInitiatePlay / aiRespond 调用 decidePlay 时传入），每圈结束（玩家再次获得牌权、
 *   尊法重触发）刷新为新弃牌的花色。
 * - 被弃牌为大小王（suit 为 null，无花色）时不设禁——「相同花色」对王无意义；
 *   但伏剑前置条件照常记录。
 */
export const LiLiZunFa: SkillDefinition = {
  id: 'lili_zunfa',
  name: '尊法',
  description: '你获得牌权时，若对方有手牌，你弃置对方一张手牌。直到本圈结束前，其不能打出相同花色的牌。',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: ['过听杀人，罪当死。', '理有法，失刑则刑，失死则死。'],

  filter: (ctx: SkillContext): boolean => {
    // 李离在阵容中
    if (!ctx.playerCharacterIds.includes(LI_LI)) return false;
    // 排除敌方获得牌权的 ON_GAIN_TURN（赵高/张良范式，否则敌方回合也触发）
    if (ctx.sourceCharacterId === ctx.enemyCharacterId) return false;
    // 此技能弃的是对方手牌，条件是对方有手牌
    return ctx.battle.enemy.hand.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const enemyHand = ctx.battle.enemy.hand;
    if (enemyHand.length === 0) return;

    visuals.playSkillTriggerSound();
    await waitForDelay(visuals.getScene(), 100);

    // 弃置敌方分数最低的一张（保留高价值牌）
    let minIdx = 0;
    for (let i = 1; i < enemyHand.length; i++) {
      const cur = enemyHand[i]!.score ?? enemyHand[i]!.rank;
      const acc = enemyHand[minIdx]!.score ?? enemyHand[minIdx]!.rank;
      if (cur < acc) minIdx = i;
    }

    const [discarded] = await discardCardsFromHand(ctx.gameScene, 'enemy', [minIdx]);
    if (!discarded) return;

    // 记录被弃牌花色（王无花色不设禁）+ 点数 + 置伏剑前置条件
    ctx.battle.liliZunfaSuit = discarded.suit ?? undefined;
    ctx.battle.liliZunfaRank = discarded.rank;
    ctx.battle.liliZunfaTriggered = true;
  },
};
