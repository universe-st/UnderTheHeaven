import { describe, it, expect } from 'vitest';
import {
  collectSeals,
  applySealBonuses,
  hasBaihu,
  hasXuanwu,
} from '../FourSealEffects';
import type { Card } from '../../models/Card';

describe('collectSeals', () => {
  it('收集牌中的全部四印（含重复）', () => {
    const cards = [
      { seal: 'qinglong' },
      {},
      { seal: 'qinglong' },
      { seal: 'baihu' },
      { seal: undefined },
    ] as Card[];
    expect(collectSeals(cards)).toEqual(['qinglong', 'qinglong', 'baihu']);
  });

  it('无印时返回空数组', () => {
    expect(collectSeals([])).toEqual([]);
    expect(collectSeals([{}, {}, {}] as Card[])).toEqual([]);
  });
});

describe('applySealBonuses', () => {
  it('青龙每张 +10 得分，不动系数', () => {
    const info = { sumRanks: 20, baseCoefficient: 2, coefficient: 2 };
    applySealBonuses(info, ['qinglong', 'qinglong']);
    expect(info.sumRanks).toBe(20 + 10 * 2);
    expect(info.coefficient).toBe(2);
    expect(info.baseCoefficient).toBe(2);
  });

  it('朱雀每张 系数 +1 且抬 baseCoefficient', () => {
    const info = { sumRanks: 20, baseCoefficient: 2, coefficient: 2 };
    applySealBonuses(info, ['zhuque', 'zhuque', 'zhuque']);
    expect(info.coefficient).toBe(2 + 3);
    expect(info.baseCoefficient).toBe(2 + 3);
  });

  it('青龙 + 朱雀 同时生效', () => {
    const info = { sumRanks: 20, baseCoefficient: 1, coefficient: 1 };
    applySealBonuses(info, ['qinglong', 'zhuque']);
    expect(info.sumRanks).toBe(30);
    expect(info.coefficient).toBe(2);
    expect(info.baseCoefficient).toBe(2);
  });

  it('白虎/玄武不影响数值', () => {
    const info = { sumRanks: 20, baseCoefficient: 1, coefficient: 1 };
    applySealBonuses(info, ['baihu', 'xuanwu']);
    expect(info).toEqual({ sumRanks: 20, baseCoefficient: 1, coefficient: 1 });
  });

  it('无印不影响', () => {
    const info = { sumRanks: 20, baseCoefficient: 1, coefficient: 1 };
    applySealBonuses(info, []);
    expect(info).toEqual({ sumRanks: 20, baseCoefficient: 1, coefficient: 1 });
  });
});

describe('hasBaihu / hasXuanwu', () => {
  it('判断是否含白虎/玄武', () => {
    expect(hasBaihu(['baihu'])).toBe(true);
    expect(hasBaihu(['qinglong', 'zhuque'])).toBe(false);
    expect(hasBaihu([])).toBe(false);
    expect(hasXuanwu(['xuanwu', 'baihu'])).toBe(true);
    expect(hasXuanwu(['qinglong'])).toBe(false);
    expect(hasXuanwu([])).toBe(false);
  });
});
