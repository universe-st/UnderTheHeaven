import type { Card } from '../models/Card';
import { SUITS, getNextCardId, rankToLabel } from '../models/Card';
import type { FourSeal } from '../models/FourSeal';
import type { BattleState } from '../models/BattleTypes';

/**
 * 吕不韦「居奇」纯逻辑（可单测，无 Phaser 依赖）。
 *
 * 规则要点：
 * - 你每次选择不出后，生成一张点数为 3、随机花色、带青龙印的牌，直接进入你的手牌
 *   （非临时牌：不设 isTemp，随后打出、结算与弃牌均按普通牌处理）。
 */

/** 居奇生成牌的点数（CARD_RANKS 中最小的 3） */
export const JUQI_CARD_RANK = 3;

/** 居奇生成牌必带的四象印：青龙（打出时伤害得分 +10） */
export const JUQI_SEAL: FourSeal = 'qinglong';

/**
 * 生成一张点数为 3、随机花色、带青龙印的普通牌（非临时牌）。
 * 直接加入玩家手牌，按普通牌规则打出与结算。
 */
export function createJuQiCard(rng: () => number = Math.random): Card {
  const suit = SUITS[Math.floor(rng() * SUITS.length)]!;
  return {
    uid: getNextCardId(),
    suit,
    rank: JUQI_CARD_RANK,
    rankLabel: rankToLabel(JUQI_CARD_RANK),
    seal: JUQI_SEAL,
  };
}

/**
 * 「你选择不出后」的居奇效果（纯逻辑，可单测）：
 * 生成一张点数为 3、随机花色、带青龙印的普通牌，直接进入玩家手牌。
 * 返回生成的牌。
 */
export function applyJuQiOnPass(battle: BattleState, rng: () => number = Math.random): Card {
  const newCard = createJuQiCard(rng);
  battle.player.hand.push(newCard);
  return newCard;
}
