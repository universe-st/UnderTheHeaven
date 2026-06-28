import { describe, it, expect, vi } from 'vitest';
import { SkillEventBus } from '../SkillEventBus';
import { SkillTiming, type SkillContext } from '../SkillTypes';

function mockContext(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    gameScene: {} as Phaser.Scene,
    battle: null as unknown as SkillContext['battle'],
    sourceCharacterId: 'test',
    playerCharacterIds: [],
    ...overrides,
  };
}

describe('SkillEventBus', () => {
  it('emits to registered handler', async () => {
    const bus = new SkillEventBus();
    const handler = vi.fn();
    bus.on(SkillTiming.ON_PLAY, handler);
    const ctx = mockContext();
    await bus.emit(SkillTiming.ON_PLAY, ctx);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it('does not call handler for different timing', async () => {
    const bus = new SkillEventBus();
    const handler = vi.fn();
    bus.on(SkillTiming.ON_PLAY, handler);
    await bus.emit(SkillTiming.AFTER_DAMAGE, mockContext());
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls multiple handlers in order', async () => {
    const bus = new SkillEventBus();
    const order: number[] = [];
    bus.on(SkillTiming.ON_PLAY, async () => { order.push(1); });
    bus.on(SkillTiming.ON_PLAY, async () => { order.push(2); });
    await bus.emit(SkillTiming.ON_PLAY, mockContext());
    expect(order).toEqual([1, 2]);
  });

  it('continues after a handler throws', async () => {
    const bus = new SkillEventBus();
    const good = vi.fn();
    bus.on(SkillTiming.ON_PLAY, async () => { throw new Error('fail'); });
    bus.on(SkillTiming.ON_PLAY, good);
    await bus.emit(SkillTiming.ON_PLAY, mockContext());
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('clears all handlers', async () => {
    const bus = new SkillEventBus();
    const handler = vi.fn();
    bus.on(SkillTiming.ON_PLAY, handler);
    bus.clear();
    await bus.emit(SkillTiming.ON_PLAY, mockContext());
    expect(handler).not.toHaveBeenCalled();
  });

  it('no-ops emit with no handlers', async () => {
    const bus = new SkillEventBus();
    await expect(bus.emit(SkillTiming.ON_PLAY, mockContext())).resolves.toBeUndefined();
  });
});
