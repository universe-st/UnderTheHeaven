import { HandType, type HandPattern } from '../models/BattleTypes';
import type { ResponseBlockModifier } from './SkillTypes';

export type { ResponseBlockModifier };

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

/** 注册所有静态被动技能。每次创建 GameScene 时在 clearPassiveSkills 之后调用。 */
export function registerAllPassiveSkills(): void {
  PASSIVE_SKILLS.clear();
  registerResponseBlock('banner_army', {
    type: 'response_block',
    getBlockedTypes: (ctx: { lastPlay: HandPattern }): HandType[] => {
      const lp = ctx.lastPlay;
      if (lp.type === HandType.Single && lp.cards.length === 1 && lp.cards[0]!.suit === 'diamond') {
        return [HandType.Single];
      }
      return [];
    },
  });
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
