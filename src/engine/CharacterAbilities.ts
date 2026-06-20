import { Card } from '../models/Card';
import { HandPattern, HandType } from '../models/BattleTypes';
import { PlayerCharacterId, EnemyCharacterId } from '../models/Character';

export function countSuits(cards: Card[]): number {
  const suits = new Set(cards.map(c => c.suit).filter(Boolean));
  return Math.max(1, suits.size);
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
    if (c.suit === 'heart') return c.rank * 2;
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
  if (newPlay.type === HandType.Rocket) return true;

  if (newPlay.type === HandType.Bomb) {
    if (lastPlay.type === HandType.Rocket) return false;
    if (lastPlay.type === HandType.Bomb) {
      return newPlay.mainValue >= lastPlay.mainValue;
    }
    return true;
  }

  if (lastPlay.type === HandType.Bomb || lastPlay.type === HandType.Rocket) {
    return false;
  }

  if (newPlay.type !== lastPlay.type) return false;
  if (newPlay.length !== lastPlay.length) return false;

  return newPlay.mainValue >= lastPlay.mainValue;
}

export function getCharacterEnemyName(enemyId: EnemyCharacterId): string {
  switch (enemyId) {
    case 'huangjinjun': return '黄巾军';
    case 'nanmanjun': return '南蛮军';
    case 'qiangdao': return '强盗';
    default: return '未知敌人';
  }
}

export function getCharacterPlayerName(playerId: PlayerCharacterId): string {
  switch (playerId) {
    case 'hanxin': return '韩信';
    case 'liubowen': return '刘伯温';
    case 'lishizhen': return '李时珍';
    case 'zhugeliang': return '诸葛亮';
    case 'wentianxiang': return '文天祥';
    case 'niugao': return '牛皋';
    default: return '未知';
  }
}
