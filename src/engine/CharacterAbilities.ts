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
 * 包拯「铁断」判定：单张【大王】(rank 30)、【小王】(rank 25) 与【9】(rank 9)。
 * 含 consideredAs 视为点数（临时牌视为 9 时同样触发）。
 */
export function isTieDuanSingle(pattern: HandPattern | null | undefined): boolean {
  if (!pattern) return false;
  if (pattern.type !== HandType.Single || pattern.cards.length !== 1) return false;
  const card = pattern.cards[0]!;
  const rank = card.consideredAs?.rank ?? card.rank;
  return rank === 9 || rank === 25 || rank === 30;
}

/**
 * 玩家接牌判定，按角色配置的 beatRule 选择规则：
 * - 'strict'（默认）必须严格大于上家才能接牌
 * - 'equal' 允许同型等值接牌
 *
 * 包拯「铁断」例外：单张 9/小王/大王 无视大小和牌型，响应对方打出的任何牌
 * （含王炸），在规则判定之前直接放行。
 *
 * 新增接牌规则只需在 PlayerCharacter.beatRule 中声明，
 * 无需修改此处或调用方（OCP）。
 */
export function canPlayerBeat(
  playerCharId: PlayerCharacterId | undefined,
  newPlay: HandPattern,
  lastPlay: HandPattern,
): boolean {
  // 包拯「铁断」：单张 9/小王/大王 无视大小和牌型响应任何牌
  if (playerCharId === 'baozheng' && isTieDuanSingle(newPlay)) return true;
  const rule = (playerCharId && PLAYER_CHARACTERS[playerCharId]?.beatRule) ?? 'strict';
  return rule === 'equal'
    ? canBeatOrEqual(newPlay, lastPlay)
    : canBeat(newPlay, lastPlay);
}

/**
 * 玩家接牌判定（多角色阵容版）：阵容任意位置含包拯时，
 * 单张 9/小王/大王 均触发「铁断」无视大小和牌型响应。
 * 其余情况按阵容第一位角色的 beatRule 判定（与 battle.player.characterId 语义一致）。
 */
export function canPlayerRosterBeat(
  playerCharacterIds: readonly PlayerCharacterId[],
  newPlay: HandPattern,
  lastPlay: HandPattern,
): boolean {
  if (playerCharacterIds.includes('baozheng') && isTieDuanSingle(newPlay)) return true;
  return canPlayerBeat(playerCharacterIds[0], newPlay, lastPlay);
}

export function getCharacterEnemyName(enemyId: EnemyCharacterId): string {
  return ENEMY_CHARACTERS[enemyId]?.name ?? '未知敌人';
}

export function getCharacterPlayerName(playerId: PlayerCharacterId): string {
  return PLAYER_CHARACTERS[playerId]?.name ?? '未知';
}
