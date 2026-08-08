import { describe, it, expect } from 'vitest';
import { FOUR_SEALS, randomFourSeal, randomSeal, SEAL_CHANCE, type FourSeal } from '../FourSeal';

describe('randomFourSeal（必带印四选一）', () => {
  it('始终返回四印之一，永不返回 null', () => {
    for (let i = 0; i < 200; i++) {
      expect(FOUR_SEALS).toContain(randomFourSeal());
    }
  });

  it('四印等概率分布（基于固定序列 rng）', () => {
    // rng 依次返回 0/4, 1/4, 2/4, 3/4，恰好命中四个索引
    const seq = [0, 0.25, 0.5, 0.75];
    let i = 0;
    const seen = new Set<FourSeal>();
    for (let n = 0; n < 40; n++) {
      seen.add(randomFourSeal(() => seq[i++ % seq.length]!));
    }
    expect(seen.size).toBe(FOUR_SEALS.length);
  });
});

describe('randomSeal（25% 概率带印）', () => {
  it('SEAL_CHANCE 以下返回四印之一，以上返回 null', () => {
    expect(randomSeal(() => 0)).not.toBeNull();
    expect(randomSeal(() => SEAL_CHANCE - 0.01)).not.toBeNull();
    expect(randomSeal(() => SEAL_CHANCE)).toBeNull();
    expect(randomSeal(() => 0.99)).toBeNull();
  });
});
