import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager, type ActiveSkillDefinition } from './SkillTypes';
import { JOKER_MIN_RANK, rankToLabel, type Card } from '../models/Card';
import { discardCardsFromHand, drawCardsToHand } from '../utils/CardActions';
import { nullifyCardDamage } from './SkillUtils';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';
import type { HandSelectEvent } from './HandSelect';

const ZHOU_GONG_DAN = 'zhougongdan';
/** 制礼开局最多弃置张数 */
const ZHI_LI_MAX = 5;

/**
 * 周公旦「制礼」由两个触发技 + 一个主动技组成：
 *   1. ZhouGongDanZhiLi — 对局开始时（开局 ON_GAIN_TURN，仅首次）经公共事件「选择手牌」
 *      弃置 1~5 张有点数且点数不同的手牌，点数记入 battle.player.zhiliRanks；
 *   2. ZhouGongDanZhiLiNullify — 本次对局中，你与对方打出这些点数的牌不再计算伤害
 *      （ON_SINGLE_CARD_SETTLEMENT，对双方生效，priority 20 先于加分技能归零）；
 *   3. ZhouGongDanZhiLiActive — 主动技：有牌权时弃置任意张这些点数的手牌摸等量的牌。
 *
 * 状态存于 battle.player.zhiliRanks（战斗内），对局结束 battle 丢弃即清空。
 */
/** 效果一：对局开始时，弃置 1～5 张有点数且点数不同的手牌 */
export const ZhouGongDanZhiLi: SkillDefinition = {
  id: 'zhougongdan_zhili',
  name: '制礼',
  description: '对局开始时，你弃置1～5张有点数且点数不同的手牌。本次对局中，你与对方打出这些点数的牌不再计算伤害。随后获得主动技：有牌权时可弃置任意张这些点数的手牌摸等量的牌。',
  timing: SkillTiming.ON_GAIN_TURN,
  priority: 100,
  dialogLines: ['礼制天下，万民有序。', '以礼立国，以法安邦。', '制礼作乐，垂范后世。'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(ZHOU_GONG_DAN)) return false;
    // 仅对局开始（玩家先手获得牌权）且尚未发动过
    if (ctx.battle.player.zhiliRanks !== undefined) return false;
    if (!ctx.playerCharacterIds.includes(ctx.sourceCharacterId)) return false;
    return true;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    visuals.playSkillTriggerSound();

    // 手牌中无任何"有点数"的牌（如自定义牌池全为大小王）时无法满足选牌条件，
    // forced 无取消按钮会导致选牌永不结束——此时直接跳过发动
    if (!ctx.battle.player.hand.some(c => c.rank < JOKER_MIN_RANK)) return;

    // 公共事件「选择手牌」：玩家在手牌区交互选 1~5 张（点数互不相同、排除大小王），
    // forced 无取消按钮——「制礼」对局开始必定发动
    const chosen = await (ctx.gameScene as Phaser.Scene & HandSelectEvent).selectHandCards({
      side: 'player',
      want: (sel) => sel.length >= 1
        && sel.length <= ZHI_LI_MAX
        && new Set(sel.map(c => c.rank)).size === sel.length,
      filter: (card) => card.rank < JOKER_MIN_RANK,
      forced: true,
      title: '制礼 · 选择 1～5 张点数不同的牌弃置',
    });
    if (!chosen || chosen.length === 0) return;

    const hand = ctx.battle.player.hand;
    const indices: number[] = [];
    for (const c of chosen) {
      const idx = hand.findIndex(h => h.uid === c.uid);
      if (idx >= 0 && !indices.includes(idx)) indices.push(idx);
    }
    if (indices.length === 0) return;

    await discardCardsFromHand(ctx.gameScene, 'player', indices);

    ctx.battle.player.zhiliRanks = chosen.map(c => c.rank);

    const rankText = chosen.map(c => rankToLabel(c.rank)).join('、');
    await showNotice(ctx.gameScene, `制礼：弃置 ${chosen.length} 张，点数 ${rankText} 不再计算伤害`);
  },
};

/** 效果二：本次对局中，你与对方打出这些点数的牌不再计算伤害 */
export const ZhouGongDanZhiLiNullify: SkillDefinition = {
  id: 'zhougongdan_zhili_nullify',
  name: '制礼',
  description: '',
  timing: SkillTiming.ON_SINGLE_CARD_SETTLEMENT,
  // 覆盖式归零：priority 置大（最后执行），确保在各类加分/倍率技能（默认 100）
  // 之后把 scoreBonus 覆盖为 -baseScore，使制礼点数的牌始终不计算伤害
  // （如程咬金「猛斧」+25 的牌若属制礼点数，最终仍归零）
  priority: 200,

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(ZHOU_GONG_DAN)) return false;
    if (!ctx.singleCard) return false;
    const ranks = ctx.battle.player.zhiliRanks;
    if (!ranks || ranks.length === 0) return false;
    const cardRank = ctx.singleCard.card.getData('rank') as number | undefined;
    if (cardRank === undefined) return false;
    return ranks.includes(cardRank);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    await nullifyCardDamage(ctx, visuals);
  },
};

/** 主动技：有牌权时弃置任意张"制礼"点数的手牌，摸等量的牌（每次获得牌权限一次） */
export const ZhouGongDanZhiLiActive: ActiveSkillDefinition = {
  id: 'zhougongdan_zhili_active',
  name: '制礼',
  description: '（主动技）弃置任意张"制礼"点数的牌，摸等量的牌。每次牌权限一次。',
  maxUses: 1,
  ownerCharacterId: ZHOU_GONG_DAN,
  dialogLines: ['礼尚往来。', '有来有往，方合礼数。', '损有余而补不足。'],

  // 宽松通过：是否属于"制礼"点数由 canUseWithSelection（可访问 scene）判定
  cardFilter: (selectedCards: Card[]): boolean => {
    return selectedCards.length > 0;
  },

  canUseWithSelection: (scene, selectedCards): boolean => {
    const ranks = scene.getBattle().player.zhiliRanks ?? [];
    if (ranks.length === 0) return false;
    return selectedCards.every(c => ranks.includes(c.rank));
  },

  execute: async (scene, selectedCards) => {
    const hand = scene.getBattle().player.hand;
    const indices = selectedCards
      .map(c => hand.findIndex(h => h.uid === c.uid))
      .filter(i => i >= 0);
    if (indices.length !== selectedCards.length) return;

    await discardCardsFromHand(scene, 'player', indices);
    await drawCardsToHand(scene, 'player', selectedCards.length);

    scene.renderPlayerHandAfterSkill();
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
