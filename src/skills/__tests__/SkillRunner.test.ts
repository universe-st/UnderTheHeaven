import { describe, it, expect, vi } from 'vitest';
import { SkillRunner } from '../SkillRunner';
import { SkillRegistry } from '../SkillRegistry';
import { SkillEventBus } from '../SkillEventBus';
import { SkillTiming, type SkillDefinition, type SkillVisualManager, type CharacterSlotManager } from '../SkillTypes';

function makeSkill(id: string, timing: SkillTiming, execute?: SkillDefinition['execute']): SkillDefinition {
  return {
    id,
    name: id,
    description: '',
    timing,
    filter: () => true,
    execute: execute ?? (async () => {}),
  };
}

function makeVisuals(): SkillVisualManager {
  return {
    animateCardScale: vi.fn(),
    showHeal: vi.fn(),
    playSkillTriggerSound: vi.fn(),
    playSfx: vi.fn(),
    getScene: () => ({}) as Phaser.Scene,
    cancelDamageSettlement: vi.fn(),
  };
}

function makeSlotManager(): CharacterSlotManager {
  return {
    glowOn: vi.fn(async () => {}),
    glowOff: vi.fn(async () => {}),
    moveToFront: vi.fn(async () => {}),
    shakeAndPulse: vi.fn(async () => {}),
    restoreSlot: vi.fn(async () => {}),
    isPlayerCharacter: vi.fn(() => true),
    getCharacterOrder: vi.fn(() => 0),
    showDialog: vi.fn(),
  };
}

describe('SkillRunner', () => {
  it('executes skills matching the emitted timing', async () => {
    const registry = new SkillRegistry();
    const eventBus = new SkillEventBus();
    const visuals = makeVisuals();
    const slotManager = makeSlotManager();

    const execute = vi.fn(async () => {});
    registry.register(makeSkill('test', SkillTiming.ON_PLAY, execute));
    registry.register(makeSkill('other', SkillTiming.AFTER_DAMAGE));

    new SkillRunner(registry, eventBus, visuals, slotManager);

    await eventBus.emit(SkillTiming.ON_PLAY, {
      gameScene: {} as Phaser.Scene,
      battle: null as never,
      sourceCharacterId: 'test',
      playerCharacterIds: [],
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('skips skills whose filter returns false', async () => {
    const registry = new SkillRegistry();
    const eventBus = new SkillEventBus();
    const visuals = makeVisuals();
    const slotManager = makeSlotManager();

    const execute = vi.fn(async () => {});
    registry.register({
      id: 'filtered',
      name: 'filtered',
      description: '',
      timing: SkillTiming.ON_PLAY,
      filter: () => false,
      execute,
    });

    new SkillRunner(registry, eventBus, visuals, slotManager);

    await eventBus.emit(SkillTiming.ON_PLAY, {
      gameScene: {} as Phaser.Scene,
      battle: null as never,
      sourceCharacterId: 'test',
      playerCharacterIds: [],
    });

    expect(execute).not.toHaveBeenCalled();
  });

  it('modifyHandValidation returns additional patterns from HAND_VALIDATION skills', async () => {
    const registry = new SkillRegistry();
    const eventBus = new SkillEventBus();
    const visuals = makeVisuals();
    const slotManager = makeSlotManager();

    registry.register({
      id: 'validation_skill',
      name: 'val',
      description: '',
      timing: SkillTiming.HAND_VALIDATION,
      filter: () => true,
      execute: async (ctx) => {
        ctx.handValidation!.additionalPatterns.push({
          type: 0 as never,
          cards: [],
          mainValue: 0,
          length: 1,
        });
      },
    });

    const runner = new SkillRunner(registry, eventBus, visuals, slotManager);
    const patterns = await runner.modifyHandValidation({
      gameScene: {} as Phaser.Scene,
      battle: null as never,
      sourceCharacterId: 'test',
      playerCharacterIds: [],
      handValidation: {
        hand: [],
        candidateCards: [],
        basePattern: null,
        additionalPatterns: [],
      },
    });

    expect(patterns).toHaveLength(1);
  });

  it('executes skills in priority order', async () => {
    const registry = new SkillRegistry();
    const eventBus = new SkillEventBus();
    const visuals = makeVisuals();
    const slotManager = makeSlotManager();

    const order: string[] = [];
    registry.register(makeSkill('low', SkillTiming.ON_PLAY, async () => { order.push('low'); }));
    const highSkill = { ...makeSkill('high', SkillTiming.ON_PLAY, async () => { order.push('high'); }), priority: 1 };
    registry.register(highSkill);

    new SkillRunner(registry, eventBus, visuals, slotManager);

    await eventBus.emit(SkillTiming.ON_PLAY, {
      gameScene: {} as Phaser.Scene,
      battle: null as never,
      sourceCharacterId: 'test',
      playerCharacterIds: [],
    });

    expect(order).toEqual(['high', 'low']);
  });
});
