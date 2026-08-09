// 间距缩小下限：保证被压住的牌至少露出左上角点数角标（16px 边距 + 「10」约 40px 宽）
export const MIN_CARD_OVERLAP = 60;

// 敌方手牌压缩下限（仅展示、无交互，可比玩家侧压得更小；不启用滑动）
export const ENEMY_HAND_MIN_OFFSET = 24;

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

export interface HandStartXResult {
  /** 第一张牌中心的 X（含滚动偏移） */
  startX: number;
  /** 牌间间距 */
  offset: number;
  /** 是否处于溢出滑动模式 */
  scrollable: boolean;
  /** 整列总宽 */
  totalWidth: number;
  /** clamp 后的滚动偏移（非滚动模式恒为 0） */
  scrollX: number;
}

/**
 * 计算手牌横向布局的起始 X（含溢出滚动偏移 clamp）。
 *
 * 与 calcHandLayout 的三级策略一致：
 * - 常规/压缩：整列居中，滚动偏移归零；
 * - 溢出（scrollable）：左对齐（margin + cardWidth/2）+ 滚动偏移（负值），
 *   滚动偏移 clamp 到 [availableWidth - totalWidth, 0]。
 *
 * 全量渲染（CardDisplayManager.renderPlayerHand）与增量操作（CardActions）
 * 必须共用此函数，保证两种路径下手牌布局完全一致。
 */
export function calcHandStartX(
  cardCount: number,
  width: number,
  availableWidth: number,
  baseOffset: number,
  cardWidth: number,
  handScrollX: number,
  minOffset: number = MIN_CARD_OVERLAP,
  margin: number = 0,
): HandStartXResult {
  const layout = calcHandLayout(cardCount, availableWidth, baseOffset, cardWidth, minOffset);
  let startX: number;
  let scrollX: number;
  if (layout.scrollable) {
    const minScroll = availableWidth - layout.totalWidth;
    scrollX = Math.min(0, Math.max(minScroll, handScrollX));
    startX = margin + cardWidth / 2 + scrollX;
  } else {
    scrollX = 0;
    startX = (width - layout.totalWidth) / 2 + cardWidth / 2;
  }
  return {
    startX,
    offset: layout.offset,
    scrollable: layout.scrollable,
    totalWidth: layout.totalWidth,
    scrollX,
  };
}
