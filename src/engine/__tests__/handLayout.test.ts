import { describe, it, expect } from 'vitest';
import { calcHandLayout, MIN_CARD_OVERLAP } from '../handLayout';

const CARD_W = 180;
const BASE_OFFSET = 135;
const AVAILABLE = 2280; // 2400 - 60*2

describe('calcHandLayout', () => {
  it('0 张牌：totalWidth 为 0，不可滑动', () => {
    const l = calcHandLayout(0, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.totalWidth).toBe(0);
    expect(l.scrollable).toBe(false);
  });

  it('1 张牌：不除零，使用基础间距，不可滑动', () => {
    const l = calcHandLayout(1, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.totalWidth).toBe(CARD_W);
    expect(l.offset).toBe(BASE_OFFSET);
    expect(l.scrollable).toBe(false);
  });

  it('少量牌（10 张）：固定基础间距', () => {
    const l = calcHandLayout(10, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.offset).toBe(BASE_OFFSET);
    expect(l.totalWidth).toBe(CARD_W + 9 * BASE_OFFSET);
    expect(l.scrollable).toBe(false);
  });

  it('17 张牌：超宽，压缩间距但仍 ≥ 下限', () => {
    const l = calcHandLayout(17, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.offset).toBeCloseTo((AVAILABLE - CARD_W) / 16);
    expect(l.offset).toBeGreaterThanOrEqual(MIN_CARD_OVERLAP);
    expect(l.scrollable).toBe(false);
    expect(l.totalWidth).toBeCloseTo(AVAILABLE);
  });

  it('60 张牌：压到下限仍超宽 → 可滑动，间距锁定下限', () => {
    const l = calcHandLayout(60, AVAILABLE, BASE_OFFSET, CARD_W);
    expect(l.offset).toBe(MIN_CARD_OVERLAP);
    expect(l.scrollable).toBe(true);
    expect(l.totalWidth).toBe(CARD_W + 59 * MIN_CARD_OVERLAP);
  });
});
