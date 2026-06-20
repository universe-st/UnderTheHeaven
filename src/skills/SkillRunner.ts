import { SkillTiming, type SkillContext, type SkillDefinition, type CharacterSlotManager } from './SkillTypes';
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
      const skills = this.registry.getSkillsByTiming(timing);
      if (skills.length > 0) {
        this.eventBus.on(timing, (context) => {
          this.executeTiming(timing, context);
        });
      }
    }
  }

  private async executeTiming(timing: SkillTiming, context: SkillContext): Promise<void> {
    const skills = this.registry.getSkillsByTiming(timing);
    for (const skill of skills) {
      if (!skill.filter(context)) continue;
      await this.executeWithAnimation(skill, context);
    }
  }

  private async executeWithAnimation(skill: SkillDefinition, ctx: SkillContext): Promise<void> {
    const ownerId = this.registry.getSkillOwner(skill.id) ?? ctx.sourceCharacterId;
    ctx.sourceCharacterId = ownerId;

    const isPlayer = this.slotManager.isPlayerCharacter(ownerId);
    try {
      if (isPlayer) {
        await this.slotManager.glowOn(ownerId);
        await this.slotManager.moveToFront(ownerId);
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
}
