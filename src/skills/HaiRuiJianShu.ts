import { SkillTiming, type SkillDefinition, type SkillContext, type SkillVisualManager } from './SkillTypes';
import type { HandSelectEvent } from './HandSelect';
import { discardCardsFromHand } from '../utils/CardActions';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT } from '../constants/Layout';
import type { PlayerCharacterId } from '../models/Character';

const HAI_RUI: PlayerCharacterId = 'hairui';

/** 宿主场景：摸满玩家手牌的公共事件方法（GameScene 实现，转发 BattleFlowManager） */
interface RefillNotifyHost {
  refillPlayerHandAndNotify(): Promise<void>;
}

function hasHaiRui(ctx: SkillContext): boolean {
  return ctx.playerCharacterIds.includes(HAI_RUI)
    && !(ctx.battle.player.lostCharacters ?? []).includes(HAI_RUI);
}

/**
 * 海瑞「谏疏」（触发技）：你打出牌造成伤害后，你需弃置一张牌或将本角色移除。
 * 若你因此失去了最后一张手牌，你摸满手牌。
 *
 * - 时机 AFTER_DAMAGE，target === 'enemy'（玩家打出牌对敌方造成伤害）且伤害 > 0；
 * - 「若你有手牌」：无手牌时不触发（filter 判定，无牌可弃也无需移除）；
 * - 玩家侧经由公共事件「选择手牌」（HandSelectEvent）选 1 张弃置，
 *   点「取消」→ 移除海瑞（lostCharacters + 角色从角色区消失，战斗结束后从阵容永久移除）；
 * - 弃置后手牌清空则触发公共事件「摸满手牌」（refillPlayerHandAndNotify）：
 *   补满 17 张 + 渲染 + 广播 ON_HAND_REFILLED，与获得牌权补满/主动技弃空路径一致，
 *   联动孙膑「减灶」、姜尚「辅王」等「摸满手牌后」技能。
 */
export const HaiRuiJianShu: SkillDefinition = {
  id: 'hairui_jianshu',
  name: '谏疏',
  description: '你打出牌造成伤害后，若你有手牌，你需弃置一张牌或将本角色移除。若你因此失去了最后一张手牌，你摸满手牌。',
  timing: SkillTiming.AFTER_DAMAGE,
  priority: 90,
  dialogLines: [
    '君者，天下臣民万物之主也。',
    '嘉靖者，言家家皆净而无财用也。',
    '吏贪官横，民不聊生，水旱无时。',
  ],

  filter: (ctx: SkillContext): boolean => {
    if (ctx.target !== 'enemy') return false;
    if (!hasHaiRui(ctx)) return false;
    if ((ctx.damageInfo?.finalDamage ?? 0) <= 0) return false;
    // 「若你有手牌」：无手牌时不触发（无牌可弃也无需移除）
    return ctx.battle.player.hand.length > 0;
  },

  execute: async (ctx: SkillContext, visuals: SkillVisualManager): Promise<void> => {
    const scene = visuals.getScene();
    visuals.playSkillTriggerSound();

    const hand = ctx.battle.player.hand;

    // 公共事件「选择手牌」：选 1 张弃置；点「取消」→ 移除海瑞
    const chosen = await (scene as Phaser.Scene & HandSelectEvent).selectHandCards({
      side: 'player',
      want: (sel) => sel.length === 1,
      filter: () => true,
      forced: false,
      title: '谏疏 · 弃置一张牌（取消则移除海瑞）',
      // 防御性 AI 策略：弃置点数最小的牌（hand 为降序排列，末张最小）
      aiPick: (aiHand) => (aiHand.length > 0 ? [aiHand[aiHand.length - 1]!] : null),
    });
    if (!chosen || chosen.length !== 1) {
      await removeHaiRui(ctx, visuals, '海瑞挂冠而去，离开队伍！');
      return;
    }

    const target = chosen[0]!;
    const idx = hand.findIndex((h) => h.uid === target.uid);
    if (idx < 0) {
      // 数据异常兜底：选出的牌已不在手牌中，不弃牌也不移除角色，避免误伤
      console.warn('[谏疏] 所选牌已不在手牌中，跳过结算');
      return;
    }

    await discardCardsFromHand(scene, 'player', [idx]);

    // 若因此失去了最后一张手牌：触发公共事件「摸满手牌」
    // （补满 + 渲染 + 广播 ON_HAND_REFILLED；孙膑「减灶」/姜尚「辅王」等照常触发）
    if (ctx.battle.player.hand.length === 0) {
      const notify = (ctx.gameScene as unknown as RefillNotifyHost | undefined)?.refillPlayerHandAndNotify;
      if (notify) {
        await notify.call(ctx.gameScene);
      } else {
        console.warn('[谏疏] 场景未实现 refillPlayerHandAndNotify，弃空后无法摸满手牌');
      }
    }
  },
};

/** 移除海瑞：写入 lostCharacters（本场技能停用），角色框淡出消失，显示离队提示 */
async function removeHaiRui(ctx: SkillContext, visuals: SkillVisualManager, message: string): Promise<void> {
  const scene = visuals.getScene();
  ctx.battle.player.lostCharacters = [...(ctx.battle.player.lostCharacters ?? []), HAI_RUI];
  visuals.markCharacterLost(HAI_RUI);

  const { width, height } = scene.scale;
  const text = scene.add.text(width / 2, height / 2 + 140, message, {
    fontSize: '34px',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    color: '#c84030',
    stroke: '#1a0800',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(DEPTH_OVERLAY_TEXT).setAlpha(0);

  await waitForTween(scene, { targets: text, alpha: 1, duration: 200, ease: 'Sine.easeOut' });
  await waitForDelay(scene, 900);
  await waitForTween(scene, {
    targets: text,
    alpha: 0,
    y: text.y - 40,
    duration: 400,
    ease: 'Sine.easeIn',
    onComplete: () => text.destroy(),
  });
}
