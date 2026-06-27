import type { Card } from './Card';
import type { PlayerCharacterId, EnemyCharacterId } from './Character';

export enum HandType {
  Single,
  Pair,
  Triple,
  TripleOne,
  TriplePair,
  Straight,
  ConsecutivePairs,
  Airplane,
  AirplaneSingle,
  AirplanePair,
  Bomb,
  Rocket,
}

export const HAND_TYPE_LABELS: Record<HandType, string> = {
  [HandType.Single]: '单张',
  [HandType.Pair]: '对子',
  [HandType.Triple]: '三张',
  [HandType.TripleOne]: '三带一',
  [HandType.TriplePair]: '三带二',
  [HandType.Straight]: '顺子',
  [HandType.ConsecutivePairs]: '连对',
  [HandType.Airplane]: '飞机',
  [HandType.AirplaneSingle]: '飞机带单',
  [HandType.AirplanePair]: '飞机带对',
  [HandType.Bomb]: '炸弹',
  [HandType.Rocket]: '王炸',
};

export interface HandPattern {
  type: HandType;
  cards: Card[];
  mainValue: number;
  length: number;
}

export interface PlayerState {
  hand: Card[];
  deck: Card[];
  discardPile: Card[];
  vitality: number;
  vitalityMax: number;
  name: string;
  characterId?: PlayerCharacterId;
  reviveUsed?: boolean;
}

export interface BattleState {
  player: PlayerState;
  enemy: PlayerState;
  enemyCharacterId?: EnemyCharacterId;
  turnHolder: 'player' | 'enemy';
  lastPlay: HandPattern | null;
  phase: 'play' | 'respond';
  turnCount: number;
}
