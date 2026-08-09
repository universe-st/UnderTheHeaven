import type { ActiveSkillDefinition, ActiveSkillSceneAccess } from './SkillTypes';
import type { Card } from '../models/Card';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';
import { waitForTween, waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY, DEPTH_OVERLAY_TEXT, CARD_W, CARD_H } from '../constants/Layout';
import {
  pickRandomIndices,
  hasRemovedBothJokers,
  hasLiXin,
  ZHOUCHU_FLAG_HAS_LIXIN,
  ZHOUCHU_FLAG_BIG_JOKER,
  ZHOUCHU_FLAG_SMALL_JOKER,
  isBigJoker,
  isSmallJoker,
} from './ZhouChuChuHaiLogic';

/**
 * 周处「除害」（主动技）
 *
 * 随机展示对方三张牌：
 * - 三张中的王（大王 龍/30、小王 虎/25，任一即算）移出对方牌库（不落弃牌堆），
 *   移出效果仅本场战斗生效（敌方每场战斗牌库重建）；
 * - 「移除过至少一张大王和一张小王」的进度跨战斗累积，达成后失去【除害】、
 *   获得【励心】（本场起【除害】按钮消失，转换结果跨战斗永久）；
 * - 三张中无王时，获得其中的红桃牌（进入手牌，战斗结束若仍持于手中则进入玩家牌库）。
 *
 * 跨战斗状态：`skillFlags.zhouchu_has_lixin`（是否已转换）以及移除进度
 * `zhouchu_removed_big_joker` / `zhouchu_removed_small_joker`，存于
 * battle.player.skillFlags（战斗内），战斗结束写回 run.characterSkillFlags。
 */
export const ZhouChuChuHai: ActiveSkillDefinition = {
  id: 'zhouchu_chuhai',
  name: '除害',
  description: '（主动技）每次获得牌权限一次。随机展示对方三张牌，其中的大王或小王被移出对方牌库；若三张中没有王，你获得其中的红桃牌。若你移除过至少一张大王和一张小王，你失去技能【除害】，获得【励心】。',
  maxUses: 1,
  ownerCharacterId: 'zhouchu',
  dialogLines: [
    '除暴安良，为民除害！',
    '虎已杀，蛟已斩，恶已除！',
    '此害不除，我心难安！',
  ],

  /** 无需选牌即可发动 */
  cardFilter: () => false,
  requiresSelection: false,
  canUseWithoutSelection: (scene) => {
    const battle = scene.getBattle();
    // 已转换（获得励心 = 失去除害）时不可发动；正常情况下转换后不再注册本技能
    if (hasLiXin(battle.player.skillFlags)) return false;
    return battle.enemy.hand.length > 0;
  },

  execute: async (scene, _selected) => {
    const battle = scene.getBattle();
    const enemyHand = battle.enemy.hand;
    if (enemyHand.length === 0) return;

    // 1) 随机选三张并展示（明置预览）
    const pickedIdx = pickRandomIndices(3, enemyHand.length);
    const picked = pickedIdx.map(i => enemyHand[i]!);
    await showReveal(scene, picked);

    const flags = { ...(battle.player.skillFlags ?? {}) };
    const jokerIdx = pickedIdx.filter(i => isBigJoker(enemyHand[i]!) || isSmallJoker(enemyHand[i]!));

    if (jokerIdx.length > 0) {
      // 2a) 三张中有王（任一）→ 将王移出对方牌库（skipDiscardPile → 不落弃牌堆）。
      //     移出效果仅本场战斗生效，敌方每场战斗牌库重建，无需记录牌本身。
      await discardCardsFromHand(scene, 'enemy', jokerIdx.sort((a, b) => a - b), {
        skipDiscardPile: true,
      });
      if (picked.some(isBigJoker)) flags[ZHOUCHU_FLAG_BIG_JOKER] = true;
      if (picked.some(isSmallJoker)) flags[ZHOUCHU_FLAG_SMALL_JOKER] = true;
      battle.player.skillFlags = flags;
      await showNotice(scene, '除害：将王移出对方牌库！');

      // 3) 累积「移除过至少一张大王和一张小王」→ 失去【除害】、获得【励心】
      if (hasRemovedBothJokers(flags) && !hasLiXin(flags)) {
        flags[ZHOUCHU_FLAG_HAS_LIXIN] = true;
        battle.player.skillFlags = flags;
        await showNotice(scene, '周处 失去【除害】，获得【励心】！', '#ffd700');
        // 重新注册主动技（不含除害），技能按钮随即消失
        scene.initActiveSkills();
        scene.renderPlayerHandAfterSkill();
      }
    } else {
      // 2b) 三张中无王 → 获得其中的红桃牌（进入手牌，战斗结束进入玩家牌库）
      const heartIdx = pickedIdx.filter(i => enemyHand[i]!.suit === 'heart');
      if (heartIdx.length > 0) {
        const hearts = await discardCardsFromHand(scene, 'enemy', heartIdx, {
          skipDiscardPile: true,
        });
        await addCardsToHand(scene, 'player', hearts);
        battle.player.acquiredCards = [...(battle.player.acquiredCards ?? []), ...hearts];
      }
      await showNotice(scene, '除害：获得对方红桃牌！', '#e8a040');
    }
  },
};

/** 屏幕中央展示若干张牌面（缩放飞入 → 停留 → 淡出），仅预览不改变手牌 */
async function showReveal(
  scene: ActiveSkillSceneAccess & Phaser.Scene,
  cards: Card[],
): Promise<void> {
  if (cards.length === 0) return;
  const { width, height } = scene.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  const gap = CARD_W + 60;
  const totalW = gap * (cards.length - 1);
  const startX = centerX - totalW / 2;

  const overlay = scene.add.container(centerX, centerY).setDepth(999).setAlpha(0);
  for (let i = 0; i < cards.length; i++) {
    const cc = scene.add.container(startX - centerX + i * gap, 0);
    drawCardFace(scene, cc, cards[i]!);
    overlay.add(cc);
  }

  await waitForTween(scene, {
    targets: overlay,
    alpha: 1,
    scaleX: { from: 0.3, to: 1 },
    scaleY: { from: 0.3, to: 1 },
    duration: 400,
    ease: 'Back.easeOut',
  });

  await waitForDelay(scene, 1400);

  await waitForTween(scene, {
    targets: overlay,
    alpha: 0,
    y: overlay.y - 60,
    duration: 300,
    ease: 'Sine.easeIn',
  });
  overlay.destroy();
}

/** 在容器内绘制一张标准牌面（背景/花色/点数/王牌红框） */
function drawCardFace(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  card: Card,
): void {
  const cardBg = scene.add.graphics();
  cardBg.fillStyle(0xf5f0e0, 1);
  cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  cardBg.lineStyle(2, 0x8a6030, 0.8);
  cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
  container.add(cardBg);

  const suitSymbols: Record<string, string> = {
    spade: '♠', club: '♣', heart: '♥', diamond: '♦',
  };
  const suitSymbol = card.suit ? (suitSymbols[card.suit] ?? '') : '';
  const topColor = card.suit === 'heart' || card.suit === 'diamond' ? '#c04040' : '#1a1a1a';

  const smallSuit = scene.add.text(-CARD_W / 2 + 10, -CARD_H / 2 + 8, suitSymbol, {
    fontSize: '22px',
    fontFamily: FONT_FAMILY,
    color: topColor,
  });
  container.add(smallSuit);

  const rankText = scene.add.text(0, 0, card.rankLabel, {
    fontSize: '64px',
    fontFamily: FONT_FAMILY,
    color: '#2a1008',
    stroke: '#ffd700',
    strokeThickness: 3,
  }).setOrigin(0.5);
  container.add(rankText);

  if (card.suit === null) {
    const ring = scene.add.graphics();
    ring.lineStyle(3, 0xdd3300, 0.9);
    ring.strokeRoundedRect(-CARD_W / 2 + 4, -CARD_H / 2 + 4, CARD_W - 8, CARD_H - 8, 6);
    container.add(ring);
  }
}

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
