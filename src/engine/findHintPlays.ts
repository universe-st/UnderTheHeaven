import type { Card } from '../models/Card';
import type { HandPattern } from '../models/BattleTypes';
import { HandType } from '../models/BattleTypes';
import { findAllPlays } from './HandRecognizer';

function isBombPattern(p: HandPattern): boolean {
  return p.type === HandType.Bomb || p.type === HandType.Rocket;
}

/**
 * 「提示」按钮候选出法：
 * - lastPlay 非空时只保留 canBeat 判定通过的出法（调用方注入角色接牌规则与被封锁牌型）
 * - 排序：非炸弹优先（不拆炸弹）→ 张数少优先 → 主点数小优先
 * 返回数组顺序即「提示」按钮循环顺序。
 */
export function findHintPlays(
  hand: Card[],
  lastPlay: HandPattern | null,
  canBeat: (pattern: HandPattern) => boolean,
): HandPattern[] {
  let plays = findAllPlays(hand);
  if (lastPlay) {
    plays = plays.filter(p => canBeat(p));
  }
  const byCost = (a: HandPattern, b: HandPattern) =>
    a.cards.length - b.cards.length || a.mainValue - b.mainValue;
  const nonBombs = plays.filter(p => !isBombPattern(p)).sort(byCost);
  const bombs = plays.filter(p => isBombPattern(p)).sort(byCost);
  return [...nonBombs, ...bombs];
}
