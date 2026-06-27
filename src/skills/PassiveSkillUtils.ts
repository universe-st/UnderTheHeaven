import type { HandType, HandPattern } from '../models/BattleTypes';

export interface ResponseBlockContext {
  lastPlay: HandPattern;
}

export interface ResponseBlockModifier {
  type: 'response_block';
  getBlockedTypes: (ctx: ResponseBlockContext) => HandType[];
}

const PASSIVE_SKILLS = new Map<string, ResponseBlockModifier[]>();

export function registerResponseBlock(characterId: string, modifier: ResponseBlockModifier): void {
  if (!PASSIVE_SKILLS.has(characterId)) {
    PASSIVE_SKILLS.set(characterId, []);
  }
  const arr = PASSIVE_SKILLS.get(characterId)!;
  if (!arr.includes(modifier)) {
    arr.push(modifier);
  }
}

export function getBlockedResponseTypes(enemyCharacterId: string | undefined, lastPlay: HandPattern | null): HandType[] {
  if (!enemyCharacterId || !lastPlay) return [];
  const modifiers = PASSIVE_SKILLS.get(enemyCharacterId);
  if (!modifiers) return [];
  const blocked: HandType[] = [];
  for (const mod of modifiers) {
    blocked.push(...mod.getBlockedTypes({ lastPlay }));
  }
  return blocked;
}

export function clearPassiveSkills(): void {
  PASSIVE_SKILLS.clear();
}