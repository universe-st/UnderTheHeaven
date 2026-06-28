import { describe, it, expect } from 'vitest';
import { SkillRegistry } from '../SkillRegistry';
import { SkillTiming, type SkillDefinition } from '../SkillTypes';

function makeSkill(id: string, timing: SkillTiming): SkillDefinition {
  return {
    id,
    name: id,
    description: '',
    timing,
    filter: () => true,
    execute: async () => {},
  };
}

describe('SkillRegistry', () => {
  it('registers a single skill', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('test', SkillTiming.ON_PLAY));
    expect(reg.getSkillsByTiming(SkillTiming.ON_PLAY)).toHaveLength(1);
  });

  it('registers all skills', () => {
    const reg = new SkillRegistry();
    reg.registerAll([
      makeSkill('a', SkillTiming.ON_PLAY),
      makeSkill('b', SkillTiming.AFTER_DAMAGE),
    ]);
    expect(reg.getSkillsByTiming(SkillTiming.ON_PLAY)).toHaveLength(1);
    expect(reg.getSkillsByTiming(SkillTiming.AFTER_DAMAGE)).toHaveLength(1);
  });

  it('filters skills by timing', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('play1', SkillTiming.ON_PLAY));
    reg.register(makeSkill('play2', SkillTiming.ON_PLAY));
    reg.register(makeSkill('after', SkillTiming.AFTER_DAMAGE));
    expect(reg.getSkillsByTiming(SkillTiming.ON_PLAY)).toHaveLength(2);
    expect(reg.getSkillsByTiming(SkillTiming.AFTER_DAMAGE)).toHaveLength(1);
  });

  it('tracks skill owner', () => {
    const reg = new SkillRegistry();
    reg.registerForBattle(
      [makeSkill('hanxin_dianbing', SkillTiming.ON_DAMAGE_MULTIPLIER_REVEALED)],
      [{ id: 'hanxin', abilities: [{ skillId: 'hanxin_dianbing' }] }],
      [],
    );
    expect(reg.getSkillOwner('hanxin_dianbing')).toBe('hanxin');
  });

  it('clears all data', () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill('test', SkillTiming.ON_PLAY));
    reg.clear();
    expect(reg.getSkillsByTiming(SkillTiming.ON_PLAY)).toHaveLength(0);
    expect(reg.getSkillOwner('test')).toBeUndefined();
  });
});
