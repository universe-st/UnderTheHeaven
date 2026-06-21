import { Card } from '../models/Card';
import { BattleState, HandPattern, HandType } from '../models/BattleTypes';
import { findAllPlays, findBeatingPlays, canBeat } from './HandRecognizer';
import { calculateDamage } from './DamageCalculator';
import { EnemyCharacterId } from '../models/Character';

// ========== AI 阈值常量 ==========

/** 评分差距在 10% 以内时从候选列表中随机选择，超出则取最高分 */
const RANDOM_THRESHOLD = 0.10;
/** 每次从评分最高的前 N 个候选中考虑随机选择 */
const RANDOM_CANDIDATE_COUNT = 3;
/** 己方手牌 ≤ 此值（含随机浮动）时考虑主动使用炸弹 */
const BOMB_HAND_THRESHOLD = 6;
/** 对方手牌 ≤ 此值（含随机浮动）时考虑主动使用炸弹 */
const BOMB_OPPONENT_HAND_THRESHOLD = 4;

// ========== 牌型优先级（数值越小越复杂，越优先出） ==========

function patternPriority(type: HandType): number {
  switch (type) {
    case HandType.Straight: return 1;
    case HandType.ConsecutivePairs: return 2;
    case HandType.AirplanePair: return 3;
    case HandType.AirplaneSingle: return 4;
    case HandType.Airplane: return 5;
    case HandType.TriplePair: return 6;
    case HandType.TripleOne: return 7;
    case HandType.Triple: return 8;
    case HandType.Pair: return 9;
    case HandType.Single: return 10;
    default: return 20;
  }
}

// ========== 炸弹阈值随机化 ==========

/**
 * 炸弹使用判断，在固定阈值周围加入 ±1 随机浮动。
 * 手牌 ≤ BOMB_HAND_THRESHOLD + rand(-1,+1) 或
 * 对手手牌 ≤ BOMB_OPPONENT_HAND_THRESHOLD + rand(-1,+1) 时返回 true。
 */
function shouldUseBomb(handSize: number, opponentHandSize: number): boolean {
  const handFuzz = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  const opponentFuzz = Math.floor(Math.random() * 3) - 1;
  return handSize <= BOMB_HAND_THRESHOLD + handFuzz ||
         opponentHandSize <= BOMB_OPPONENT_HAND_THRESHOLD + opponentFuzz;
}

// ========== 辅助函数 ==========

/**
 * 从手牌中移除已打出的牌，返回剩余手牌。
 * 逐张匹配（suit + rank），正确处理多张相同牌。
 */
function getRemainingHand(hand: Card[], played: Card[]): Card[] {
  const used = new Set<number>();
  const result: Card[] = [];
  for (const c of hand) {
    let consumed = false;
    for (let i = 0; i < played.length; i++) {
      if (!used.has(i) && played[i].suit === c.suit && played[i].rank === c.rank) {
        used.add(i);
        consumed = true;
        break;
      }
    }
    if (!consumed) result.push(c);
  }
  return result;
}

/** 复合牌型集合（Straight / 连对 / 飞机 / 炸弹 / 王炸） */
const COMPLEX_COMBO_TYPES = new Set([
  HandType.Straight,
  HandType.ConsecutivePairs,
  HandType.Airplane,
  HandType.AirplaneSingle,
  HandType.AirplanePair,
  HandType.Bomb,
  HandType.Rocket,
]);

// ========== 评分系统 ==========

/**
 * 对单个候选牌型进行多因素评分。
 *
 * 评分因素：
 * - 伤害数值（结合牌型系数）
 * - 出牌数量（清空手牌倾向）
 * - 组合完整性保护（出牌后剩余手牌是否保留好牌型）
 * - 接牌节省性（刚好管上即可，避免浪费大牌）—— 仅 isFollow 模式
 * - 牌型复杂度偏好（主动出牌时倾向出复合牌型）
 */
function scorePlay(
  play: HandPattern,
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId?: EnemyCharacterId,
): number {
  let score = 0;

  // ① 伤害贡献：系数越高的牌型伤害越大，主动出牌时偏好多打伤害
  const damage = calculateDamage(play);
  score += damage * 0.05;

  // ② 手牌清空倾向：一次出牌越多，剩余手牌越少，越接近胜利
  score += play.cards.length * 3;

  // ③ 组合完整性保护：出牌后剩余手牌中保留的复合牌型越多越好
  const remaining = getRemainingHand(hand, play.cards);
  if (remaining.length > 0) {
    const remainingPlays = findAllPlays(remaining);
    const goodComboCount = remainingPlays.filter(p =>
      COMPLEX_COMBO_TYPES.has(p.type),
    ).length;
    score += goodComboCount * 2;
  }

  // ④ 接牌节省性：用刚好管上的牌接，避免浪费大牌
  if (isFollow && lastPlay) {
    const margin = play.mainValue - lastPlay.mainValue;
    score -= margin * 3;          // 牌值差距越大扣分越多
    if (margin <= 2) score += 4;  // 刚好管上的小加分
  }

  // ⑤ 主动出牌时偏好复合牌型（顺子 > 飞机 > 连对 > ... > 单张）
  if (!isFollow) {
    const priority = patternPriority(play.type);
    score += (11 - priority) * 4;
  }

  // ⑥ 南蛮军藤甲：偏好打出黑桃牌（敌方黑色牌不计算伤害），避免打出红桃牌
  if (enemyCharacterId === 'nanmanjun') {
    for (const card of play.cards) {
      if (card.suit === 'spade' || card.suit === 'club') score += 5;
      if (card.suit === 'heart') score -= 10;
    }
  }

  return score;
}

// ========== 随机选择机制 ==========

/**
 * 带随机性的出牌选择：
 * 1. 对所有候选牌型评分，按分数降序排列
 * 2. 取前 RANDOM_CANDIDATE_COUNT 个候选
 * 3. 若其中有多于一个候选的分数与最高分差距 < RANDOM_THRESHOLD，
 *    从中随机选择一个（增加不可预测性）
 * 4. 否则选分数最高的（保持确定性最佳选择）
 */
function selectPlay(
  plays: HandPattern[],
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId?: EnemyCharacterId,
): HandPattern {
  if (plays.length === 1) return plays[0];

  const scored = plays.map(p => ({
    play: p,
    score: scorePlay(p, hand, isFollow, lastPlay, enemyCharacterId),
  }));
  scored.sort((a, b) => b.score - a.score);

  const topN = scored.slice(0, Math.min(RANDOM_CANDIDATE_COUNT, scored.length));
  const bestScore = topN[0].score;

  const closeCandidates = topN.filter(s => {
    if (bestScore <= 0) return true;
    return (bestScore - s.score) / bestScore < RANDOM_THRESHOLD;
  });

  // 多个候选分数接近时随机选择
  if (closeCandidates.length > 1) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)].play;
  }

  // 差距过大则取最高分
  return topN[0].play;
}

// ========== AI 决策主入口 ==========

export function decidePlay(battleState: BattleState): Card[] | null {
  const aiHand = battleState.enemy.hand;
  const enemyCharId = battleState.enemyCharacterId;

  const generateAllPlays = (hand: Card[]): HandPattern[] => {
    return findAllPlays(hand);
  };

  const generateBeatingPlays = (hand: Card[], lastPlay: HandPattern): HandPattern[] => {
    return findBeatingPlays(hand, lastPlay);
  };

  // ---- 主动出牌模式 ----
  if (battleState.phase === 'play') {
    const allPlays = generateAllPlays(aiHand);
    if (allPlays.length === 0) return null;

    const bombs = allPlays.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );
    const normalPlays = allPlays.filter(
      p => p.type !== HandType.Bomb && p.type !== HandType.Rocket,
    );

    if (normalPlays.length > 0) {
      const selected = selectPlay(normalPlays, aiHand, false, null, enemyCharId);
      return selected.cards;
    }

    if (bombs.length > 0) {
      const selected = selectPlay(bombs, aiHand, false, null, enemyCharId);
      return selected.cards;
    }

    return null;
  }

  // ---- 接牌模式 ----
  if (!battleState.lastPlay) return null;

  const beating = generateBeatingPlays(aiHand, battleState.lastPlay);
  if (beating.length > 0) {
    // 优先使用同牌型的合法出牌（带节省性评分）
    const sameTypeBeating = beating.filter(
      p => p.type === battleState.lastPlay!.type,
    );
    if (sameTypeBeating.length > 0) {
      const selected = selectPlay(sameTypeBeating, aiHand, true, battleState.lastPlay, enemyCharId);
      return selected.cards;
    }

    // 仅炸弹/王炸可管上（对手出了炸弹），直接用最小炸弹
    const bombBeating = beating.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );
    if (bombBeating.length > 0) {
      const selected = selectPlay(bombBeating, aiHand, false, null, enemyCharId);
      return selected.cards;
    }
  }

  // ---- 无合法接牌，考虑用炸弹强行接管 ----
  const lastType = battleState.lastPlay.type;
  if (lastType !== HandType.Bomb && lastType !== HandType.Rocket) {
    const allPlays = generateAllPlays(aiHand);
    const bombPlays = allPlays.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );

    const handSize = aiHand.length;
    const opponentHandSize = battleState.player.hand.length;

    if (bombPlays.length > 0 && shouldUseBomb(handSize, opponentHandSize)) {
      const selected = selectPlay(bombPlays, aiHand, false, null, enemyCharId);
      return selected.cards;
    }
  }

  return null;
}
