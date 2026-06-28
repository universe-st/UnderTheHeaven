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

/**
 * 玩家接牌判定，按角色配置的 beatRule 选择规则：
 * - 'strict'（默认）必须严格大于上家才能接牌
 * - 'equal' 允许同型等值接牌
 *
 * 新增接牌规则只需在 PlayerCharacter.beatRule 中声明，
 * 无需修改此处或调用方（OCP）。
 */
export function canPlayerBeat(
  playerCharId: PlayerCharacterId | undefined,
  newPlay: HandPattern,
  lastPlay: HandPattern,
): boolean {
  const rule = (playerCharId && PLAYER_CHARACTERS[playerCharId]?.beatRule) ?? 'strict';
  return rule === 'equal'
    ? canBeatOrEqual(newPlay, lastPlay)
    : canBeat(newPlay, lastPlay);
}

export function getCharacterEnemyName(enemyId: EnemyCharacterId): string {
  return ENEMY_CHARACTERS[enemyId]?.name ?? '未知敌人';
}

export function getCharacterPlayerName(playerId: PlayerCharacterId): string {
  return PLAYER_CHARACTERS[playerId]?.name ?? '未知';
}
