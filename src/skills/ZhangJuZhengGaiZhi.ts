import type { ActiveSkillDefinition } from './SkillTypes';
import type { Card } from '../models/Card';
import { getNextCardId, rankToLabel } from '../models/Card';
import { nextRank, hasNormalCards } from './ZhangJuZhengGaiZhiLogic';
import { discardCardsFromHand, addCardsToHand } from '../utils/CardActions';
import { waitForDelay } from '../utils/AnimationUtils';
import { FONT_FAMILY } from '../constants/Layout';

/**
 * 张居正「改制」（主动技）：每局游戏限一次，弃置手上所有非大小王的牌，
 * 生成点数+1 的临时牌（点数最小 3、最大 2，2 封顶不再累加）。
 * 重置时机：resetOnLostTurn=true，在玩家失去牌权（对方获得牌权）时重置发动次数
 * （见 ActiveSkillManager.resetActiveSkillUses）。
 */
export const ZhangJuZhengGaiZhi: ActiveSkillDefinition = {
  id: 'zhangjuzheng_gaizhi',
  name: '改制',
  description: '（主动技）每局游戏限一次，弃置手上所有的非大小王的牌，生成点数+1的临时牌。失去牌权后重置发动次数。',
  maxUses: 1,
  ownerCharacterId: 'zhangjuzheng',
  dialogLines: [
    '改革弊政，一往无前！',
    '推陈出新，何惧非议！',
    '国库充盈，天下可治！',
  ],
  // 改制描述明确"失去牌权后重置"：在玩家失去牌权（对方获得牌权）时重置次数
  resetOnLostTurn: true,
  // 改制作用于手上所有非大小王牌，无需先选中牌
  requiresSelection: false,
  canUseWithoutSelection: (scene) => hasNormalCards(scene.getBattle().player.hand),

  cardFilter: (selectedCards: Card[]): boolean => {
    // 选中牌时仍要求含非大小王牌（无选牌路径走 canUseWithoutSelection）
    return hasNormalCards(selectedCards);
  },

  execute: async (scene, _selectedCards) => {
    const hand = scene.getBattle().player.hand;

    // 弃置手上所有非大小王牌（花色非空即普通牌）
    const indices: number[] = [];
    for (let i = 0; i < hand.length; i++) {
      if (hand[i]!.suit !== null) indices.push(i);
    }
    if (indices.length === 0) return;

    const count = indices.length;

    const centerX = scene.scale.width / 2;
    const centerY = scene.scale.height / 2;

    const overlay = scene.add.container(centerX, centerY).setDepth(999);

    const bg = scene.add.graphics();
    bg.fillStyle(0x1a0a2a, 0.9);
    bg.fillRoundedRect(-170, -90, 340, 180, 14);
    bg.lineStyle(2, 0xffd700, 0.7);
    bg.strokeRoundedRect(-170, -90, 340, 180, 14);
    overlay.add(bg);

    const titleText = scene.add.text(0, -50, '改 制', {
      fontSize: '34px',
      fontFamily: FONT_FAMILY,
      color: '#ffd700',
      stroke: '#1a0a2a',
      strokeThickness: 2,
    }).setOrigin(0.5);
    overlay.add(titleText);

    const sub1Text = scene.add.text(0, -2, `弃 ${count} 张`, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#c8a080',
    }).setOrigin(0.5);
    overlay.add(sub1Text);

    const sub2Text = scene.add.text(0, 32, `生成 ${count} 张点数+1 临时牌`, {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      color: '#c8a080',
    }).setOrigin(0.5);
    overlay.add(sub2Text);

    overlay.setScale(0.5);
    overlay.setAlpha(0);
    await new Promise<void>(resolve => {
      scene.tweens.add({
        targets: overlay,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 350,
        ease: 'Back.easeOut',
        onComplete: () => resolve(),
      });
    });

    await waitForDelay(scene, 500);

    // 弃置所有非大小王牌
    const discarded = await discardCardsFromHand(scene, 'player', indices);

    // 生成点数+1 的临时牌（花色不变，2 封顶）
    const tempCards: Card[] = discarded.map((c) => {
      const rank = nextRank(c.rank);
      return {
        uid: getNextCardId(),
        suit: c.suit,
        rank,
        rankLabel: rankToLabel(rank),
        score: rank,
        isTemp: true,
      };
    });

    await addCardsToHand(scene, 'player', tempCards);

    await new Promise<void>(resolve => {
      scene.tweens.add({
        targets: overlay,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 250,
        ease: 'Sine.easeIn',
        onComplete: () => {
          overlay.destroy();
          resolve();
        },
      });
    });

    scene.renderPlayerHandAfterSkill();
  },
};
