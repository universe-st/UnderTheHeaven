import type { Card } from '../models/Card';
import type { HandPattern } from '../models/BattleTypes';
import { HandType } from '../models/BattleTypes';
import type { PlayerCharacterId, EnemyCharacterId } from '../models/Character';
import { PLAYER_CHARACTERS, ENEMY_CHARACTERS } from '../models/Character';
import { canBeat } from './HandRecognizer';

export function countSuits(cards: Card[]): number {
  const suits = new Set(cards.map(c => c.suit).filter(Boolean));
  return suits.size;
}

export function countHearts(cards: Card[]): number {
  return cards.filter(c => c.suit === 'heart').length;
}

export function sumClubRanks(cards: Card[]): number {
  return cards.filter(c => c.suit === 'club').reduce((s, c) => s + c.rank, 0);
}

export function applyNanmanTengjia(cards: Card[]): { effectiveSumRanks: number } {
  const effective = cards.map(c => {
    if (c.suit === 'spade' || c.suit === 'club') return 0;
    if (c.suit === 'heart') return c.rank * 3;
    return c.rank;
  });
  return { effectiveSumRanks: effective.reduce((s, r) => s + r, 0) };
}

export function isSamePattern(a: HandPattern, b: HandPattern): boolean {
  if (a.type !== b.type) return false;
  if (a.length !== b.length) return false;
  if (a.mainValue !== b.mainValue) return false;
  return true;
}

export function canBeatOrEqual(newPlay: HandPattern, lastPlay: HandPattern): boolean {
  if (lastPlay.type === HandType.Rocket) return false;
  return canBeat(newPlay, lastPlay) || isSamePattern(newPlay, lastPlay);
}

export function getCharacterEnemyName(enemyId: EnemyCharacterId): string {
  return ENEMY_CHARACTERS[enemyId]?.name ?? '未知敌人';
}

export function getCharacterPlayerName(playerId: PlayerCharacterId): string {
  return PLAYER_CHARACTERS[playerId]?.name ?? '未知';
}
