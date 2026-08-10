import { describe, it, expect, beforeEach } from 'vitest';
import type { Card } from '../../models/Card';
import { getNextCardId, resetCardIdCounter } from '../../models/Card';
import { HandType } from '../../models/BattleTypes';
import { canBeat, identifyHand } from '../HandRecognizer';
import { findHintPlays } from '../findHintPlays';

function makeCard(rank: number, suit: Card['suit'] = 'spade'): Card {
  return { uid: getNextCardId(), suit, rank, rankLabel: String(rank), score: rank };
}

beforeEach(() => resetCardIdCounter());

describe('findHintPlays', () => {
  it('跟牌：首选能压过上家的最小单张', () => {
    const hand = [makeCard(3), makeCard(4, 'club'), makeCard(5, 'heart'), makeCard(6, 'diamond')];
    const lastPlay = identifyHand([makeCard(4, 'heart')])!; // 单张 4
    const plays = findHintPlays(hand, lastPlay, p => canBeat(p, lastPlay));
    expect(plays.length).toBeGreaterThan(0);
    expect(plays[0]!.type).toBe(HandType.Single);
    expect(plays[0]!.mainValue).toBe(5);
  });

  it('炸弹排在最后（不优先拆炸弹）', () => {
    const hand = [
      makeCard(9), makeCard(9, 'club'), makeCard(9, 'heart'), makeCard(9, 'diamond'),
      makeCard(6, 'club'),
    ];
    const lastPlay = identifyHand([makeCard(5)])!;
    const plays = findHintPlays(hand, lastPlay, p => canBeat(p, lastPlay));
    expect(plays[0]!.type).toBe(HandType.Single);
    expect(plays[0]!.mainValue).toBe(6);
    expect(plays[plays.length - 1]!.type).toBe(HandType.Bomb);
  });

  it('自由出牌（lastPlay = null）：最小单张优先', () => {
    const hand = [makeCard(3), makeCard(7, 'club'), makeCard(7, 'heart'), makeCard(13)];
    const plays = findHintPlays(hand, null, () => true);
    expect(plays[0]!.type).toBe(HandType.Single);
    expect(plays[0]!.mainValue).toBe(3);
  });

  it('canBeat 全部否决时返回空数组', () => {
    const hand = [makeCard(3), makeCard(4, 'club')];
    const lastPlay = identifyHand([makeCard(20)])!; // 单张 2
    const plays = findHintPlays(hand, lastPlay, () => false);
    expect(plays).toEqual([]);
  });
});
