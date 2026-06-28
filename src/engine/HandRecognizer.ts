import type { Card } from '../models/Card';
import type { HandPattern} from '../models/BattleTypes';
import { HandType } from '../models/BattleTypes';

export function rankForOrder(r: number): number {
  if (r === 15) return 14; // A = 14 for ordering
  if (r === 20) return 15; // 2 = 15
  if (r === 25) return 16; // 小王
  if (r === 30) return 17; // 大王
  return r;
}

export function rankFromOrder(o: number): number {
  if (o === 14) return 15; // A
  if (o === 15) return 20; // 2
  if (o === 16) return 25;
  if (o === 17) return 30;
  return o;
}

export function canBeInConsecutive(rank: number): boolean {
  return (rank >= 3 && rank <= 13) || rank === 15;
}

function groupByOrderRank(cards: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const o = rankForOrder(c.rank);
    if (!map.has(o)) map.set(o, []);
    map.get(o)!.push(c);
  }
  return map;
}

function findConsecutiveRuns(ranks: number[], minLen: number): { start: number; end: number }[] {
  const sorted = [...ranks].sort((a, b) => a - b);
  const runs: { start: number; end: number }[] = [];
  if (sorted.length === 0) return runs;

  let start = sorted[0]!;
  let end = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! === end + 1) {
      end = sorted[i]!;
    } else {
      if (end - start + 1 >= minLen) {
        runs.push({ start, end });
      }
      start = sorted[i]!;
      end = sorted[i]!;
    }
  }
  if (end - start + 1 >= minLen) {
    runs.push({ start, end });
  }
  return runs;
}

function cardsEqual(c1: Card, c2: Card): boolean {
  return c1.suit === c2.suit && c1.rank === c2.rank;
}

export function identifyHand(cards: Card[]): HandPattern | null {
  if (cards.length === 0) return null;

  const n = cards.length;
  const sorted = [...cards].sort((a, b) => a.rank - b.rank);
  const counts = new Map<number, number>();
  for (const c of sorted) {
    counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  }

  // Rocket
  if (n === 2 && sorted[0]!.rank === 25 && sorted[1]!.rank === 30) {
    return { type: HandType.Rocket, cards: sorted, mainValue: 25, length: 2 };
  }

  // Bomb
  if (n === 4 && counts.size === 1) {
    const rank = sorted[0]!.rank;
    return { type: HandType.Bomb, cards: sorted, mainValue: rank, length: 1 };
  }

  // Single
  if (n === 1) {
    return { type: HandType.Single, cards: sorted, mainValue: sorted[0]!.rank, length: 1 };
  }

  // Pair
  if (n === 2 && counts.size === 1) {
    const rank = sorted[0]!.rank;
    return { type: HandType.Pair, cards: sorted, mainValue: rank, length: 1 };
  }

  // Triple
  if (n === 3 && counts.size === 1) {
    const rank = sorted[0]!.rank;
    return { type: HandType.Triple, cards: sorted, mainValue: rank, length: 1 };
  }

  // TripleOne
  if (n === 4) {
    const entries = Array.from(counts.entries());
    const triple = entries.find(([, c]) => c === 3);
    const single = entries.find(([, c]) => c === 1);
    if (triple && single && triple[0] !== single[0]) {
      return { type: HandType.TripleOne, cards: sorted, mainValue: triple[0], length: 1 };
    }
  }

  // TriplePair
  if (n === 5) {
    const entries = Array.from(counts.entries());
    const triple = entries.find(([, c]) => c === 3);
    const pair = entries.find(([, c]) => c === 2);
    if (triple && pair && triple[0] !== pair[0]) {
      return { type: HandType.TriplePair, cards: sorted, mainValue: triple[0], length: 1 };
    }
  }

  // Straight (≥5 cards, all singles, consecutive)
  if (n >= 5 && allSingles(counts)) {
    const ranks = [...counts.keys()].sort((a, b) => a - b);
    const orderRanks = ranks.map(r => rankForOrder(r)).sort((a, b) => a - b);
    if (isConsecutiveSorted(orderRanks)) {
      if (orderRanks.every(r => canBeInConsecutive(rankFromOrder(r)))) {
        return { type: HandType.Straight, cards: sorted, mainValue: rankFromOrder(orderRanks[0]!), length: n };
      }
    }
  }

  // ConsecutivePairs (≥3 pairs, consecutive ranks)
  if (n >= 6 && n % 2 === 0) {
    const pairs = Array.from(counts.entries()).filter(([, c]) => c === 2 || c === 3 || c === 4);
    if (pairs.every(([, c]) => c >= 2)) {
      const totalPairs = n / 2;
      if (pairs.length === totalPairs) {
        const pairRanks = pairs.map(([r]) => r).sort((a, b) => a - b);
        const orderPairRanks = pairRanks.map(r => rankForOrder(r));
        if (isConsecutiveSorted(orderPairRanks) && pairRanks.every(r => canBeInConsecutive(r)) && orderPairRanks.length >= 3) {
          return { type: HandType.ConsecutivePairs, cards: sorted, mainValue: rankFromOrder(orderPairRanks[0]!), length: orderPairRanks.length };
        }
      }
    }
  }

  // Airplane (≥2 consecutive triples)
  if (n >= 6) {
    const triples = Array.from(counts.entries()).filter(([, c]) => c >= 3);
    if (triples.length >= 2) {
      const tripRanks = triples.map(([r]) => r).filter(r => canBeInConsecutive(r)).sort((a, b) => a - b);
      const orderTripRanks = tripRanks.map(r => rankForOrder(r));
      const runs = findConsecutiveRuns(orderTripRanks, 2);
      for (const run of runs) {
        const runLen = run.end - run.start + 1;
        const totalCardsInTriples = runLen * 3;
        const remaining = n - totalCardsInTriples;

        // Pure airplane
        if (remaining === 0) {
          return { type: HandType.Airplane, cards: sorted, mainValue: rankFromOrder(run.start), length: runLen };
        }

        // Airplane + singles
        if (remaining === runLen) {
          const mainCards = getCardsByRanks(sorted, run.start, run.end, 3);
          const kickers = sorted.filter(c => !mainCards.some(mc => cardsEqual(mc, c)));
          if (kickers.length === runLen) {
            const kickerRanks = new Set(kickers.map(k => k.rank));
            const tripRealRanks = new Set(mainCards.map(mc => mc.rank));
            // Check no kicker matches triple ranks
            const conflict = [...kickerRanks].some(r => tripRealRanks.has(r));
            if (!conflict) {
              return { type: HandType.AirplaneSingle, cards: sorted, mainValue: rankFromOrder(run.start), length: runLen };
            }
          }
        }

        // Airplane + pairs
        if (remaining === runLen * 2) {
          const mainCards = getCardsByRanks(sorted, run.start, run.end, 3);
          const kickers = sorted.filter(c => !mainCards.some(mc => cardsEqual(mc, c)));
          const kickerCounts = new Map<number, number>();
          for (const k of kickers) {
            kickerCounts.set(k.rank, (kickerCounts.get(k.rank) || 0) + 1);
          }
          const allPairs = Array.from(kickerCounts.values()).every(c => c === 2 || c === 4);
          const kickerRanks = new Set(kickerCounts.keys());
          const tripRealRanks = new Set(mainCards.map(mc => mc.rank));
          const conflict = [...kickerRanks].some(r => tripRealRanks.has(r));
          if (allPairs && !conflict) {
            return { type: HandType.AirplanePair, cards: sorted, mainValue: rankFromOrder(run.start), length: runLen };
          }
        }
      }
    }
  }

  return null;
}

function allSingles(counts: Map<number, number>): boolean {
  for (const count of counts.values()) {
    if (count !== 1) return false;
  }
  return true;
}

function isConsecutiveSorted(ranks: number[]): boolean {
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i]! !== ranks[i - 1]! + 1) return false;
  }
  return true;
}

function getCardsByRanks(cards: Card[], start: number, end: number, count: number): Card[] {
  const result: Card[] = [];
  const grouped = new Map<number, Card[]>();
  for (const c of cards) {
    const o = rankForOrder(c.rank);
    if (!grouped.has(o)) grouped.set(o, []);
    grouped.get(o)!.push(c);
  }
  for (let r = start; r <= end; r++) {
    const group = grouped.get(r);
    if (group) {
      result.push(...group.slice(0, count));
    }
  }
  return result;
}

export function findAllPlays(hand: Card[]): HandPattern[] {
  const results: HandPattern[] = [];
  const grouped = groupByOrderRank(hand);
  const allOrderRanks = [...grouped.keys()].sort((a, b) => a - b);

  // Singles
  for (const card of hand) {
    results.push({ type: HandType.Single, cards: [card], mainValue: card.rank, length: 1 });
  }

  // Pairs
  for (const [oRank, cards] of grouped) {
    if (cards.length >= 2) {
      const sub = [...cards].slice(0, 2);
      results.push({ type: HandType.Pair, cards: sub, mainValue: rankFromOrder(oRank), length: 1 });
    }
  }

  // Triples
  for (const [oRank, cards] of grouped) {
    if (cards.length >= 3) {
      const sub = [...cards].slice(0, 3);
      results.push({ type: HandType.Triple, cards: sub, mainValue: rankFromOrder(oRank), length: 1 });
    }
  }

  // TripleOne
  for (const [oRank, cards] of grouped) {
    if (cards.length >= 3) {
      const triple = [...cards].slice(0, 3);
      for (const card of hand) {
        if (rankForOrder(card.rank) !== oRank) {
          results.push({
            type: HandType.TripleOne,
            cards: [...triple, card],
            mainValue: rankFromOrder(oRank),
            length: 1,
          });
        }
      }
    }
  }

  // TriplePair
  for (const [oRank, cards] of grouped) {
    if (cards.length >= 3) {
      const triple = [...cards].slice(0, 3);
      for (const [oRank2, cards2] of grouped) {
        if (oRank2 !== oRank && cards2.length >= 2) {
          results.push({
            type: HandType.TriplePair,
            cards: [...triple, ...cards2.slice(0, 2)],
            mainValue: rankFromOrder(oRank),
            length: 1,
          });
        }
      }
    }
  }

  // Straights
  const singleRanks = allOrderRanks.filter(r => {
    const realRank = rankFromOrder(r);
    return canBeInConsecutive(realRank) && grouped.get(r)!.length >= 1;
  });

  // Standard straights (no A-as-1)
  const runs = findConsecutiveRuns(singleRanks, 5);
  for (const run of runs) {
    for (let len = 5; len <= run.end - run.start + 1; len++) {
      for (let s = run.start; s + len - 1 <= run.end; s++) {
        const combo: Card[] = [];
        for (let r = s; r < s + len; r++) {
          combo.push(grouped.get(r)![0]!);
        }
        results.push({
          type: HandType.Straight,
          cards: combo,
          mainValue: rankFromOrder(s),
          length: len,
        });
      }
    }
  }

  // ConsecutivePairs
  const pairRanks = allOrderRanks.filter(r => {
    const realRank = rankFromOrder(r);
    return canBeInConsecutive(realRank) && grouped.get(r)!.length >= 2;
  });
  const pairRuns = findConsecutiveRuns(pairRanks, 3);
  for (const run of pairRuns) {
    for (let len = 3; len <= run.end - run.start + 1; len++) {
      for (let s = run.start; s + len - 1 <= run.end; s++) {
        const combo: Card[] = [];
        for (let r = s; r < s + len; r++) {
          combo.push(...grouped.get(r)!.slice(0, 2));
        }
        results.push({
          type: HandType.ConsecutivePairs,
          cards: combo,
          mainValue: rankFromOrder(s),
          length: len,
        });
      }
    }
  }

  // Airplanes
  const tripRanks = allOrderRanks.filter(r => {
    const realRank = rankFromOrder(r);
    return canBeInConsecutive(realRank) && grouped.get(r)!.length >= 3;
  });
  const tripRuns = findConsecutiveRuns(tripRanks, 2);
  for (const run of tripRuns) {
    for (let len = 2; len <= run.end - run.start + 1; len++) {
      for (let s = run.start; s + len - 1 <= run.end; s++) {
        const triples: Card[] = [];
        for (let r = s; r < s + len; r++) {
          triples.push(...grouped.get(r)!.slice(0, 3));
        }

        // Pure airplane
        results.push({
          type: HandType.Airplane,
          cards: triples,
          mainValue: rankFromOrder(s),
          length: len,
        });

        // Airplane + singles
        const remainingSingles = hand.filter(c => {
          return !triples.some(tc => cardsEqual(tc, c));
        });
        const tripRanksSet = new Set<number>();
        for (let r = s; r < s + len; r++) tripRanksSet.add(rankFromOrder(r));
        const validSingles = remainingSingles.filter(c => !tripRanksSet.has(c.rank));

        if (validSingles.length >= len) {
          const combos = chooseKickSingleCombos(validSingles, len);
          for (const k of combos) {
            results.push({
              type: HandType.AirplaneSingle,
              cards: [...triples, ...k],
              mainValue: rankFromOrder(s),
              length: len,
            });
          }
        }

        // Airplane + pairs
        const pairCandidates = validSingles;
        const pairGroups = new Map<number, Card[]>();
        for (const c of pairCandidates) {
          if (!pairGroups.has(c.rank)) pairGroups.set(c.rank, []);
          pairGroups.get(c.rank)!.push(c);
        }
        const availablePairRanks = [...pairGroups.entries()]
          .filter(([, cards]) => cards.length >= 2)
          .map(([rank]) => rank);

        if (availablePairRanks.length >= len) {
          const pairCombos = chooseKickPairCombos(availablePairRanks, pairGroups, len);
          for (const k of pairCombos) {
            results.push({
              type: HandType.AirplanePair,
              cards: [...triples, ...k],
              mainValue: rankFromOrder(s),
              length: len,
            });
          }
        }
      }
    }
  }

  // Bombs
  for (const [oRank, cards] of grouped) {
    if (cards.length === 4) {
      results.push({
        type: HandType.Bomb,
        cards: [...cards],
        mainValue: rankFromOrder(oRank),
        length: 1,
      });
    }
  }

  // Rocket
  const hasSmall = hand.find(c => c.rank === 25);
  const hasBig = hand.find(c => c.rank === 30);
  if (hasSmall && hasBig) {
    results.push({
      type: HandType.Rocket,
      cards: [hasSmall, hasBig],
      mainValue: 25,
      length: 2,
    });
  }

  // Deduplicate: sort cards within each pattern and remove duplicates
  return deduplicatePatterns(results);
}

function chooseKickSingleCombos(cards: Card[], count: number): Card[][] {
  const result: Card[][] = [];
  function backtrack(start: number, current: Card[]) {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      current.push(cards[i]!);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

function chooseKickPairCombos(
  ranks: number[],
  pairGroups: Map<number, Card[]>,
  count: number
): Card[][] {
  const result: Card[][] = [];
  function backtrack(start: number, current: Card[]) {
    if (current.length === count * 2) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < ranks.length; i++) {
      const pair = pairGroups.get(ranks[i]!)!.slice(0, 2);
      current.push(...pair);
      backtrack(i + 1, current);
      current.splice(current.length - 2, 2);
    }
  }
  backtrack(0, []);
  return result;
}

function patternSignature(p: HandPattern): string {
  const sorted = [...p.cards].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (a.suit || '') > (b.suit || '') ? 1 : -1;
  });
  return `${p.type}|${p.mainValue}|${p.length}|${sorted.map(c => `${c.suit || 'J'}${c.rank}`).join(',')}`;
}

function deduplicatePatterns(patterns: HandPattern[]): HandPattern[] {
  const seen = new Set<string>();
  return patterns.filter(p => {
    const sig = patternSignature(p);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

export function canBeat(newPlay: HandPattern, lastPlay: HandPattern): boolean {
  // Rocket beats everything except another Rocket
  if (newPlay.type === HandType.Rocket) {
    if (lastPlay.type === HandType.Rocket) return false;
    return true;
  }

  // Bomb beats non-bomb, non-rocket
  if (newPlay.type === HandType.Bomb) {
    if (lastPlay.type === HandType.Rocket) return false;
    if (lastPlay.type === HandType.Bomb) {
      return newPlay.mainValue > lastPlay.mainValue;
    }
    return true;
  }

  // Non-bomb cannot beat bomb or rocket
  if (lastPlay.type === HandType.Bomb || lastPlay.type === HandType.Rocket) {
    return false;
  }

  // Same type comparison
  if (newPlay.type !== lastPlay.type) return false;

  // Length must match for consecutive types
  if (newPlay.length !== lastPlay.length) return false;

  return newPlay.mainValue > lastPlay.mainValue;
}

export function findBeatingPlays(hand: Card[], lastPlay: HandPattern): HandPattern[] {
  const allPlays = findAllPlays(hand);
  return allPlays.filter(p => canBeat(p, lastPlay));
}
