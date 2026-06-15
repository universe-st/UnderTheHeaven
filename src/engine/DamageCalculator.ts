import { HandPattern, HandType } from '../models/BattleTypes';

const COEFFICIENT_MAP: Record<HandType, (length: number) => number> = {
  [HandType.Single]: () => 1,
  [HandType.Pair]: () => 1.2,
  [HandType.Triple]: () => 1.5,
  [HandType.TripleOne]: () => 1.5,
  [HandType.TriplePair]: () => 2,
  [HandType.Straight]: (n) => 2 + (n - 5) * 0.5,
  [HandType.ConsecutivePairs]: () => 2,
  [HandType.Airplane]: () => 2.5,
  [HandType.AirplaneSingle]: () => 2.5,
  [HandType.AirplanePair]: () => 2.5,
  [HandType.Bomb]: () => 3,
  [HandType.Rocket]: () => 4,
};

export function calculateDamage(pattern: HandPattern): number {
  const sumPoints = pattern.cards.reduce((sum, c) => sum + c.rank, 0);
  const coeffFn = COEFFICIENT_MAP[pattern.type];
  const coefficient = coeffFn(pattern.length);
  return Math.round(sumPoints * coefficient);
}

export function calculateDamageWithEmptyHand(pattern: HandPattern): number {
  return calculateDamage(pattern) * 5;
}

export function getCoefficient(handType: HandType, length: number): number {
  return COEFFICIENT_MAP[handType](length);
}
