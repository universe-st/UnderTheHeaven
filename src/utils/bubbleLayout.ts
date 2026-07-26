export function clampBubbleCenterX(
  anchorX: number,
  boxW: number,
  screenWidth: number,
  margin: number,
): number {
  const half = boxW / 2;
  return Math.min(Math.max(anchorX, margin + half), screenWidth - margin - half);
}

export function clampBubbleTailX(offsetX: number, boxW: number): number {
  const limit = boxW / 2 - 24;
  return Math.min(Math.max(offsetX, -limit), limit);
}
