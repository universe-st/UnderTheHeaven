import { describe, it, expect } from 'vitest';
import { calcHandLayout, calcHandStartX, MIN_CARD_OVERLAP, ENEMY_HAND_MIN_OFFSET } from '../handLayout';

const CARD_W = 180;
const BASE_OFFSET = 135;
const AVAILABLE = 2280; // 2400 - 60*2
const WIDTH = 2400;
const MARGIN = 60;

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

describe('calcHandStartX（与全量渲染共用的起始 X 计算）', () => {
  it('常规（10 张）：整列居中，滚动偏移归零', () => {
    const r = calcHandStartX(10, WIDTH, AVAILABLE, BASE_OFFSET, CARD_W, -300, MIN_CARD_OVERLAP, MARGIN);
    expect(r.scrollable).toBe(false);
    expect(r.scrollX).toBe(0);
    expect(r.offset).toBe(BASE_OFFSET);
    // totalWidth = 180 + 9*135 = 1395，居中起点 = (2400-1395)/2 + 90
    expect(r.startX).toBe((WIDTH - (CARD_W + 9 * BASE_OFFSET)) / 2 + CARD_W / 2);
  });

  it('压缩（17 张）：间距压缩并居中，不可滚动', () => {
    const r = calcHandStartX(17, WIDTH, AVAILABLE, BASE_OFFSET, CARD_W, -300, MIN_CARD_OVERLAP, MARGIN);
    expect(r.scrollable).toBe(false);
    expect(r.scrollX).toBe(0);
    expect(r.offset).toBeCloseTo((AVAILABLE - CARD_W) / 16);
    expect(r.startX).toBe((WIDTH - AVAILABLE) / 2 + CARD_W / 2);
  });

  it('溢出（60 张）：左对齐 + 滚动偏移，滚动偏移保留并 clamp', () => {
    const r = calcHandStartX(60, WIDTH, AVAILABLE, BASE_OFFSET, CARD_W, -500, MIN_CARD_OVERLAP, MARGIN);
    expect(r.scrollable).toBe(true);
    expect(r.offset).toBe(MIN_CARD_OVERLAP);
    const minScroll = AVAILABLE - (CARD_W + 59 * MIN_CARD_OVERLAP);
    expect(r.scrollX).toBe(-500); // -500 在 [minScroll, 0] 内，保留
    expect(r.startX).toBe(MARGIN + CARD_W / 2 - 500);
    expect(minScroll).toBeLessThan(-500);
  });

  it('溢出时滚动偏移向下 clamp 到 minScroll', () => {
    const r = calcHandStartX(60, WIDTH, AVAILABLE, BASE_OFFSET, CARD_W, -100000, MIN_CARD_OVERLAP, MARGIN);
    const minScroll = AVAILABLE - (CARD_W + 59 * MIN_CARD_OVERLAP);
    expect(r.scrollX).toBe(minScroll);
    expect(r.startX).toBe(MARGIN + CARD_W / 2 + minScroll);
  });

  it('溢出时滚动偏移向上 clamp 到 0', () => {
    const r = calcHandStartX(60, WIDTH, AVAILABLE, BASE_OFFSET, CARD_W, 500, MIN_CARD_OVERLAP, MARGIN);
    expect(r.scrollX).toBe(0);
    expect(r.startX).toBe(MARGIN + CARD_W / 2);
  });

  it('敌方压缩下限（24px）：60 张压缩居中，不溢出滚动', () => {
    const r = calcHandStartX(60, WIDTH, AVAILABLE, BASE_OFFSET, CARD_W, 0, ENEMY_HAND_MIN_OFFSET, 0);
    expect(r.scrollable).toBe(false);
    expect(r.scrollX).toBe(0);
    // 压缩间距 = (2280-180)/59 ≈ 35.6，仍高于 24 下限，不进入滚动
    expect(r.offset).toBeCloseTo((AVAILABLE - CARD_W) / 59);
    expect(r.offset).toBeGreaterThan(ENEMY_HAND_MIN_OFFSET);
    expect(r.startX).toBe((WIDTH - AVAILABLE) / 2 + CARD_W / 2);
  });
});
