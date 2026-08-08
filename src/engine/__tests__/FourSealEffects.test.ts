import { describe, it, expect } from 'vitest';
import {
  collectSeals,
  countSeal,
  QINGLONG_SCORE_BONUS,
  ZHUQUE_COEFFICIENT_BONUS,
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

describe('countSeal', () => {
  it('统计指定印的张数', () => {
    expect(countSeal(['qinglong', 'qinglong', 'baihu'], 'qinglong')).toBe(2);
    expect(countSeal(['qinglong', 'qinglong', 'baihu'], 'zhuque')).toBe(0);
    expect(countSeal([], 'xuanwu')).toBe(0);
  });
});

describe('四印数值常量', () => {
  it('青龙单牌 +10 得分', () => {
    expect(QINGLONG_SCORE_BONUS).toBe(10);
  });

  it('朱雀每张 系数 +1', () => {
    expect(ZHUQUE_COEFFICIENT_BONUS).toBe(1);
  });
});
