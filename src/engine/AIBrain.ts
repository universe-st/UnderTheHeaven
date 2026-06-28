import type { Card } from '../models/Card';
import type { BattleState, HandPattern} from '../models/BattleTypes';
import { HandType } from '../models/BattleTypes';
import { findAllPlays, findBeatingPlays } from './HandRecognizer';
import { calculateDamage } from './DamageCalculator';
import type { EnemyCharacterId } from '../models/Character';

// ========== AI 阈值常量 ==========

/** 评分差距在 10% 以内时从候选列表中随机选择，超出则取最高分 */
const RANDOM_THRESHOLD = 0.10;
/** 每次从评分最高的前 N 个候选中考虑随机选择 */
const RANDOM_CANDIDATE_COUNT = 3;
/** 己方手牌 ≤ 此值（含随机浮动）时考虑主动使用炸弹 */
const BOMB_HAND_THRESHOLD = 6;
/** 对方手牌 ≤ 此值（含随机浮动）时考虑主动使用炸弹 */
const BOMB_OPPONENT_HAND_THRESHOLD = 4;

// ========== AI 个性档案类型 ==========

export interface ScoreWeights {
  damageWeight: number;
  clearingWeight: number;
  comboPreserveWeight: number;
  savingMaterialWeight: number;
  closeMarginBonus: number;
  complexityWeight: number;
}

export interface SelectionConfig {
  candidateCount: number;
  randomThreshold: number;
}

export interface BotProfile {
  aggression: number;
  comboPreference: number;
  handClearingTendency: number;
  weights: ScoreWeights | null;
  selection: SelectionConfig;
  passThreshold: number;
  bombOverride: { base: number; fuzzRange: number } | null;
}

export interface AIDecisionContext {
  hand: Card[];
  battleState: BattleState;
  lastPlay: HandPattern | null;
  isFollow: boolean;
}

export interface ScoredPlay {
  play: HandPattern;
  score: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  damageWeight: 0.05,
  clearingWeight: 3,
  comboPreserveWeight: 2,
  savingMaterialWeight: 3,
  closeMarginBonus: 4,
  complexityWeight: 4,
};

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
  const playedUids = new Set(played.map(c => c.uid));
  return hand.filter(c => !playedUids.has(c.uid));
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
  profile?: BotProfile,
): number {
  const w = profile?.weights ?? DEFAULT_WEIGHTS;
  let score = 0;

  // ① 伤害贡献：系数越高的牌型伤害越大，主动出牌时偏好多打伤害
  const damage = calculateDamage(play);
  score += damage * w.damageWeight;

  // ② 手牌清空倾向：一次出牌越多，剩余手牌越少，越接近胜利
  score += play.cards.length * w.clearingWeight;

  // ③ 组合完整性保护：出牌后剩余手牌中保留的复合牌型越多越好
  const remaining = getRemainingHand(hand, play.cards);
  if (remaining.length > 0) {
    const remainingPlays = findAllPlays(remaining);
    const goodComboCount = remainingPlays.filter(p =>
      COMPLEX_COMBO_TYPES.has(p.type),
    ).length;
    score += goodComboCount * w.comboPreserveWeight;
  }

  // ④ 接牌节省性：用刚好管上的牌接，避免浪费大牌
  if (isFollow && lastPlay) {
    const margin = play.mainValue - lastPlay.mainValue;
    score -= margin * w.savingMaterialWeight;  // 牌值差距越大扣分越多
    if (margin <= 2) score += w.closeMarginBonus;  // 刚好管上的小加分
  }

  // ⑤ 主动出牌时偏好复合牌型（顺子 > 飞机 > 连对 > ... > 单张）
  if (!isFollow) {
    const priority = patternPriority(play.type);
    const pref = profile?.comboPreference ?? 0.5;
    score += (11 - priority) * w.complexityWeight * pref;
  }

  // ⑥ 最少浪费：顺子/连对/飞机应从最小点数开出，保护大牌
  if (play.type === HandType.Straight || play.type === HandType.ConsecutivePairs ||
      play.type === HandType.Airplane || play.type === HandType.AirplaneSingle ||
      play.type === HandType.AirplanePair) {
    const minCard = [...play.cards].sort((a, b) => a.rank - b.rank)[0]!;
    if (minCard.rank === play.mainValue) {
      score += 5;
    }
  }

  // ⑦ 南蛮军藤甲：偏好打出黑桃牌（敌方黑色牌不计算伤害），避免打出红桃牌
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
  profile?: BotProfile,
): HandPattern {
  if (plays.length === 1) return plays[0]!;

  const scored = plays.map(p => ({
    play: p,
    score: scorePlay(p, hand, isFollow, lastPlay, enemyCharacterId, profile),
  }));
  scored.sort((a, b) => b.score - a.score);

  const sel = profile?.selection ?? { candidateCount: 3, randomThreshold: 0.10 };
  const topN = scored.slice(0, Math.min(sel.candidateCount, scored.length));
  const bestScore = topN[0]!.score;

  const closeCandidates = topN.filter(s => {
    if (bestScore <= 0) return true;
    return (bestScore - s.score) / bestScore < sel.randomThreshold;
  });

  // 多个候选分数接近时随机选择
  if (closeCandidates.length > 1) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)]!.play;
  }

  // 差距过大则取最高分
  return topN[0]!.play;
}

// ========== AI 个性档案 ==========

const BOT_PROFILES: Record<EnemyCharacterId, BotProfile> = {
  shizu: {
    aggression: 0.3,
    comboPreference: 0.3,
    handClearingTendency: 0.3,
    weights: null,
    selection: { candidateCount: 2, randomThreshold: 0.05 },
    passThreshold: 0.2,
    bombOverride: null,
  },
  huangjinjun: {
    aggression: 0.6,
    comboPreference: 0.4,
    handClearingTendency: 0.3,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.0,
    bombOverride: null,
  },
  nanmanjun: {
    aggression: 0.5,
    comboPreference: 0.5,
    handClearingTendency: 0.3,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.1,
    bombOverride: null,
  },
  qiangdao: {
    aggression: 0.5,
    comboPreference: 0.4,
    handClearingTendency: 0.4,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.1,
    bombOverride: null,
  },
  banner_army: {
    aggression: 0.5,
    comboPreference: 0.3,
    handClearingTendency: 0.2,
    weights: null,
    selection: { candidateCount: 3, randomThreshold: 0.10 },
    passThreshold: 0.1,
    bombOverride: null,
  },
  mongol_army: {
    aggression: 0.7,
    comboPreference: 0.4,
    handClearingTendency: 0.4,
    weights: null,
    selection: { candidateCount: 4, randomThreshold: 0.15 },
    passThreshold: 0.0,
    bombOverride: null,
  },
  xiliang_army: {
    aggression: 0.8,
    comboPreference: 0.6,
    handClearingTendency: 0.6,
    weights: null,
    selection: { candidateCount: 4, randomThreshold: 0.20 },
    passThreshold: 0.3,
    bombOverride: null,
  },
  xiongnu_army: {
    aggression: 0.4,
    comboPreference: 0.3,
    handClearingTendency: 0.2,
    weights: null,
    selection: { candidateCount: 2, randomThreshold: 0.08 },
    passThreshold: 0.3,
    bombOverride: null,
  },
};

// ========== 带钩子的评分与选择辅助函数 ==========

function scorePlayCandidates(
  plays: HandPattern[],
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId: EnemyCharacterId | undefined,
  profile: BotProfile | undefined,
  adjustPlayScores: ((plays: { play: HandPattern; score: number }[], ctx: AIDecisionContext) => void) | undefined,
  battleState: BattleState,
): { play: HandPattern; score: number }[] {
  const scored: { play: HandPattern; score: number }[] = plays.map(p => ({
    play: p,
    score: scorePlay(p, hand, isFollow, lastPlay, enemyCharacterId, profile),
  }));

  // 血量压力修正
  if (profile && battleState) {
    const opponentVitality = isFollow
      ? battleState.player.vitality
      : battleState.enemy.vitality;
    for (const s of scored) {
      const damage = calculateDamage(s.play);
      if (damage >= opponentVitality) {
        s.score += 30 * profile.aggression;
      } else if (opponentVitality - damage < opponentVitality * 0.3) {
        s.score += 15 * profile.aggression;
      }
    }
  }

  // 调用外部钩子（onAIDecision）
  if (adjustPlayScores) {
    adjustPlayScores(scored, {
      hand,
      battleState,
      lastPlay,
      isFollow,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function selectPlayWithHooks(
  plays: HandPattern[],
  hand: Card[],
  isFollow: boolean,
  lastPlay: HandPattern | null,
  enemyCharacterId: EnemyCharacterId | undefined,
  profile: BotProfile | undefined,
  adjustPlayScores: ((plays: { play: HandPattern; score: number }[], ctx: AIDecisionContext) => void) | undefined,
  battleState: BattleState,
): HandPattern | undefined {
  const scored = scorePlayCandidates(plays, hand, isFollow, lastPlay, enemyCharacterId, profile, adjustPlayScores, battleState);
  if (scored.length === 0) return undefined;
  if (scored.length === 1) return scored[0]!.play;

  const sel = profile?.selection ?? { candidateCount: 3, randomThreshold: 0.10 };
  const topN = scored.slice(0, Math.min(sel.candidateCount, scored.length));
  const bestScore = topN[0]!.score;

  const closeCandidates = topN.filter(s => {
    if (bestScore <= 0) return true;
    return (bestScore - s.score) / bestScore < sel.randomThreshold;
  });

  if (closeCandidates.length > 1) {
    return closeCandidates[Math.floor(Math.random() * closeCandidates.length)]!.play;
  }
  return topN[0]!.play;
}

// ========== AI 决策主入口 ==========

export function decidePlay(
  battleState: BattleState,
  adjustPlayScores?: (plays: { play: HandPattern; score: number }[], ctx: AIDecisionContext) => void,
): Card[] | null {
  const aiHand = battleState.enemy.hand;
  const enemyCharId = battleState.enemyCharacterId;
  const profile = enemyCharId ? BOT_PROFILES[enemyCharId] : undefined;

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
      const selected = selectPlayWithHooks(
        normalPlays, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }

    if (bombs.length > 0) {
      const selected = selectPlayWithHooks(
        bombs, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }

    return null;
  }

  // ---- 接牌模式 ----
  if (!battleState.lastPlay) return null;

  const beating = generateBeatingPlays(aiHand, battleState.lastPlay);
  if (beating.length > 0) {
    // 战略放弃：passThreshold 高于最高评分时放弃接牌
    if (profile && profile.passThreshold > 0) {
      const topScored = scorePlayCandidates(beating, aiHand, true, battleState.lastPlay, enemyCharId, profile, adjustPlayScores, battleState);
      if (topScored.length > 0 && topScored[0]!.score < profile.passThreshold * 50) {
        // 战略放弃，不退出 — 继续到炸弹接管检查
      } else {
        // 正常接牌流程
        const sameTypeBeating = beating.filter(
          p => p.type === battleState.lastPlay!.type,
        );
        if (sameTypeBeating.length > 0) {
          const selected = selectPlayWithHooks(
            sameTypeBeating, aiHand, true, battleState.lastPlay, enemyCharId, profile, adjustPlayScores, battleState,
          );
          return selected?.cards ?? null;
        }

        const bombBeating = beating.filter(
          p => p.type === HandType.Bomb || p.type === HandType.Rocket,
        );
        if (bombBeating.length > 0) {
          const selected = selectPlayWithHooks(
            bombBeating, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
          );
          return selected?.cards ?? null;
        }
      }
    } else {
      // 原逻辑：无 passThreshold 时正常接牌
      const sameTypeBeating = beating.filter(
        p => p.type === battleState.lastPlay!.type,
      );
      if (sameTypeBeating.length > 0) {
        const selected = selectPlayWithHooks(
          sameTypeBeating, aiHand, true, battleState.lastPlay, enemyCharId, profile, adjustPlayScores, battleState,
        );
        return selected?.cards ?? null;
      }

      const bombBeating = beating.filter(
        p => p.type === HandType.Bomb || p.type === HandType.Rocket,
      );
      if (bombBeating.length > 0) {
        const selected = selectPlayWithHooks(
          bombBeating, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
        );
        return selected?.cards ?? null;
      }
    }
  }

  // ---- 考虑用炸弹强行接管 ----
  const lastType = battleState.lastPlay.type;
  if (lastType !== HandType.Bomb && lastType !== HandType.Rocket) {
    const allPlays = generateAllPlays(aiHand);
    const bombPlays = allPlays.filter(
      p => p.type === HandType.Bomb || p.type === HandType.Rocket,
    );

    const bombCfg = profile?.bombOverride;
    const handSize = aiHand.length;
    const opponentHandSize = battleState.player.hand.length;

    // Use profile bomb thresholds if available, otherwise use global defaults with fuzz
    const use = bombCfg
      ? (handSize <= bombCfg.base + (Math.floor(Math.random() * (bombCfg.fuzzRange * 2 + 1)) - bombCfg.fuzzRange) ||
         opponentHandSize <= bombCfg.base + (Math.floor(Math.random() * (bombCfg.fuzzRange * 2 + 1)) - bombCfg.fuzzRange))
      : shouldUseBomb(handSize, opponentHandSize);

    if (bombPlays.length > 0 && use) {
      const selected = selectPlayWithHooks(
        bombPlays, aiHand, false, null, enemyCharId, profile, adjustPlayScores, battleState,
      );
      return selected?.cards ?? null;
    }
  }

  return null;
}
