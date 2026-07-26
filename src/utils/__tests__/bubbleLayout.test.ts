import { describe, it, expect } from 'vitest';
import { clampBubbleCenterX, clampBubbleTailX } from '../bubbleLayout';

describe('clampBubbleCenterX', () => {
  it('居中锚点：不钳制', () => {
    expect(clampBubbleCenterX(1200, 300, 2400, 16)).toBe(1200);
  });

  it('左边缘锚点：气泡右移，左边距 = margin', () => {
    expect(clampBubbleCenterX(54, 300, 2400, 16)).toBe(166);
  });

  it('右边缘锚点：气泡左移，右边距 = margin', () => {
    expect(clampBubbleCenterX(2380, 300, 2400, 16)).toBe(2234);
  });
});

describe('clampBubbleTailX', () => {
  it('偏移在框内：原样返回', () => {
    expect(clampBubbleTailX(-112, 300)).toBe(-112);
  });

  it('偏移超出框宽一半：钳制到 boxW/2 - 24', () => {
    expect(clampBubbleTailX(-500, 300)).toBe(-126);
    expect(clampBubbleTailX(500, 300)).toBe(126);
  });
});
