import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import { cardDisplayName } from '../models/Card';
import { addCardsToHand } from '../utils/CardActions';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';

const YU_CHI_GONG = 'yuchigong';

/**
 * 尉迟恭「夺槊」：你响应对方的牌后，若你手牌数不大于10张，你获得对方打出的牌，这些牌变为临时牌。
 *
 * - 时机 ON_PLAY：玩家打出牌时触发；filter 限定必须为响应（跟牌）出牌
 *   （ctx.isRespond === true），先手主动出牌不触发。
 * - 「对方打出的牌」= 你刚接住的这一手（敌方最近一次打出的牌）。实现上取
 *   ctx.battle.roundEnemyCards 中尚未被夺走的牌（夺走的牌已从该数组移除），
 *   故自然等于敌方最近一手；只夺非临时牌（敌方打出的临时牌不获得），与姜尚
 *   「垂钓」保持一致语义。
 * - 手牌数判定：ON_PLAY 时玩家刚打出的牌已移出手牌，故 filter 里 hand.length
 *   为「响应后」的手牌数（描述「你响应对方的牌后……若你手牌数不大于10张」）。
 * - 执行：夺得的牌置 isTemp、从敌方弃牌堆按 uid 移出（敌方出牌时已 push 进
 *   discardPile，必须移出防止洗牌重复）、从 roundEnemyCards 移出（防止本圈内
 *   再次响应时重复夺取），再加入玩家手牌。
 */
export const YuChiGongDuoShuo: SkillDefinition = {
  id: 'yuchigong_duoshuo',
  name: '夺槊',
  description: '你响应对方的牌后，若你手牌数不大于10张，你获得对方打出的牌，这些牌变为临时牌',
  timing: SkillTiming.ON_PLAY,
  priority: 100,
  dialogLines: ['空手夺槊，易如反掌！', '敌槊虽利，尽入我手！', '拿你兵刃，杀你威风！'],

  filter: (ctx: SkillContext): boolean => {
    if (!ctx.playerCharacterIds.includes(YU_CHI_GONG)) return false;
    if (ctx.target !== 'enemy') return false;
    // 必须为响应（跟牌）出牌：先手主动出牌不触发
    if (ctx.isRespond !== true) return false;
    // 手牌数不大于10张才触发（响应后手牌数）
    if (ctx.battle.player.hand.length > 10) return false;
    // 敌方这一手打出的可夺（非临时）牌存在
    const roundCards = ctx.battle.roundEnemyCards ?? [];
    return roundCards.some(c => !c.isTemp);
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const roundCards = ctx.battle.roundEnemyCards ?? [];
    const gained = roundCards.filter(c => !c.isTemp);
    if (gained.length === 0) return;

    visuals.playSkillTriggerSound();

    // 将这些牌变成临时牌
    for (const c of gained) c.isTemp = true;

    // 从敌方弃牌堆按 uid 移除（敌方出牌时已 push 进 discardPile，必须移出防止洗牌重复）
    const uids = new Set(gained.map(c => c.uid));
    ctx.battle.enemy.discardPile = ctx.battle.enemy.discardPile.filter(c => !uids.has(c.uid));
    // 从 roundEnemyCards 移出，避免本圈内再次响应时重复夺取
    ctx.battle.roundEnemyCards = roundCards.filter(c => !uids.has(c.uid));

    // 加入玩家手牌（含视觉动画与渲染）
    await addCardsToHand(ctx.gameScene, 'player', gained);

    const names = gained.map(c => cardDisplayName(c)).join('、');
    await showNotice(ctx.gameScene, `夺槊：获得对方的 ${names}`);
  },
};

/** 屏幕中部提示文字（浮现 → 停留 → 上浮淡出），与姜尚「垂钓」一致 */
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
