import { SkillTiming, type SkillContext, type SkillDefinition, type CharacterSlotManager } from './SkillTypes';
import type { HandPattern } from '../models/BattleTypes';
import { SkillRegistry } from './SkillRegistry';
import { SkillEventBus } from './SkillEventBus';
import type { SkillVisualManager } from './SkillTypes';

export class SkillRunner {
  private registry: SkillRegistry;
  private eventBus: SkillEventBus;
  private visuals: SkillVisualManager;
  private slotManager: CharacterSlotManager;

  constructor(
    registry: SkillRegistry,
    eventBus: SkillEventBus,
    visuals: SkillVisualManager,
    slotManager: CharacterSlotManager,
  ) {
    this.registry = registry;
    this.eventBus = eventBus;
    this.visuals = visuals;
    this.slotManager = slotManager;

    this.bindAllSkills();
  }

  private bindAllSkills(): void {
    for (const timing of Object.values(SkillTiming)) {
      if (timing === SkillTiming.PASSIVE_MODIFIER) continue;
      if (timing === SkillTiming.HAND_VALIDATION) continue;
      this.eventBus.on(timing, async (context) => {
        await this.executeTiming(timing, context);
      });
    }
  }

  private async executeTiming(timing: SkillTiming, context: SkillContext): Promise<void> {
    const skills = this.registry.getSkillsByTiming(timing);
    if (skills.length === 0) return;

    const ordered = this.sortByPriorityThenCharacterOrder(skills);

    for (const skill of ordered) {
      if (!skill.filter(context)) continue;
      await this.executeWithAnimation(skill, context);
    }
  }

  private sortByPriorityThenCharacterOrder(skills: SkillDefinition[]): SkillDefinition[] {
    return [...skills].sort((a, b) => {
      const priorityA = a.priority ?? 100;
      const priorityB = b.priority ?? 100;
      if (priorityA !== priorityB) return priorityA - priorityB;

      const orderA = this.slotManager.getCharacterOrder(
        this.registry.getSkillOwner(a.id) ?? '',
      );
      const orderB = this.slotManager.getCharacterOrder(
        this.registry.getSkillOwner(b.id) ?? '',
      );
      return orderA - orderB;
    });
  }

  private async executeWithAnimation(skill: SkillDefinition, ctx: SkillContext): Promise<void> {
    const ownerId = this.registry.getSkillOwner(skill.id) ?? ctx.sourceCharacterId;
    ctx.sourceCharacterId = ownerId;

    const isPlayer = this.slotManager.isPlayerCharacter(ownerId);
    try {
      if (isPlayer) {
        await this.slotManager.glowOn(ownerId);
        await this.slotManager.moveToFront(ownerId);
        await this.slotManager.shakeAndPulse(ownerId);
      }

      if (skill.dialogLines && skill.dialogLines.length > 0) {
        const line = skill.dialogLines[Math.floor(Math.random() * skill.dialogLines.length)];
        this.slotManager.showDialog(ownerId, line);
      }

      await skill.execute(ctx, this.visuals);
    } catch (err) {
      console.warn(`[SkillRunner] skill ${skill.id} error:`, err);
    } finally {
      if (isPlayer) {
        await this.slotManager.glowOff(ownerId);
        await this.slotManager.restoreSlot(ownerId);
      }
    }
  }

  async modifyHandValidation(contextBase: SkillContext): Promise<HandPattern[]> {
    const skills = this.registry.getSkillsByTiming(SkillTiming.HAND_VALIDATION);
    if (skills.length === 0) return [];

    const additionalPatterns: HandPattern[] = [];
    const ctx: SkillContext = {
      ...contextBase,
      handValidation: {
        hand: contextBase.handValidation?.hand ?? [],
        candidateCards: contextBase.handValidation?.candidateCards ?? [],
        basePattern: contextBase.handValidation?.basePattern ?? null,
        additionalPatterns,
      },
    };

    for (const skill of skills) {
      if (!skill.filter(ctx)) continue;
      try {
        await skill.execute(ctx, this.visuals);
      } catch (err) {
        console.warn(`[SkillRunner] modifyHandValidation ${skill.id} error:`, err);
      }
    }

    return additionalPatterns;
  }
}
