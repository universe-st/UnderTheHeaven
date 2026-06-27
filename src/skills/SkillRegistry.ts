import type { SkillTiming, SkillDefinition } from './SkillTypes';

export class SkillRegistry {
  private skills: SkillDefinition[] = [];
  private skillOwnerMap: Map<string, string> = new Map();

  register(skill: SkillDefinition): void {
    this.skills.push(skill);
  }

  registerAll(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  registerForBattle(
    allSkills: SkillDefinition[],
    playerCharacters: { id: string; abilities: { skillId: string }[] }[],
    enemyCharacters: { id: string; abilities: { skillId: string }[] }[],
  ): void {
    const activeSkillIds = new Set<string>();
    for (const char of playerCharacters) {
      for (const ab of char.abilities) {
        activeSkillIds.add(ab.skillId);
        this.skillOwnerMap.set(ab.skillId, char.id);
      }
    }
    for (const char of enemyCharacters) {
      for (const ab of char.abilities) {
        activeSkillIds.add(ab.skillId);
        this.skillOwnerMap.set(ab.skillId, char.id);
      }
    }
    this.registerAll(allSkills.filter(s => activeSkillIds.has(s.id)));
  }

  getSkillOwner(skillId: string): string | undefined {
    return this.skillOwnerMap.get(skillId);
  }

  getSkillsByTiming(timing: SkillTiming): SkillDefinition[] {
    return this.skills.filter(s => s.timing === timing);
  }

  clear(): void {
    this.skills = [];
    this.skillOwnerMap.clear();
  }
}
