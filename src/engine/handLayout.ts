export const MIN_CARD_OVERLAP = 40;

export interface HandLayout {
  offset: number;
  scrollable: boolean;
  totalWidth: number;
}

/**
 * 手牌横向布局三级策略：
 * 1. 常规：基础间距放得下 → baseOffset
 * 2. 压缩：超宽 → 间距压缩（下限 minOffset），整列居中
 * 3. 溢出：压到下限仍超宽 → 间距锁定 minOffset，scrollable = true（调用方负责横向滑动）
 */
export function calcHandLayout(
  cardCount: number,
  availableWidth: number,
  baseOffset: number,
  cardWidth: number,
  minOffset: number = MIN_CARD_OVERLAP,
): HandLayout {
  if (cardCount <= 0) {
    return { offset: baseOffset, scrollable: false, totalWidth: 0 };
  }
  const baseTotal = cardWidth + (cardCount - 1) * baseOffset;
  if (baseTotal <= availableWidth) {
    return { offset: baseOffset, scrollable: false, totalWidth: baseTotal };
  }
  const compressed = (availableWidth - cardWidth) / (cardCount - 1);
  if (compressed >= minOffset) {
    return { offset: compressed, scrollable: false, totalWidth: availableWidth };
  }
  return {
    offset: minOffset,
    scrollable: true,
    totalWidth: cardWidth + (cardCount - 1) * minOffset,
  };
}
