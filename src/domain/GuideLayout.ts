export type GuideRect = { x: number; y: number; width: number; height: number };
export type GuideViewport = GuideRect & { top: number; bottom: number };

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/** Window measurements are translated into the overlay's own coordinate space. */
export function localGuideRect(
  target: GuideRect,
  root: GuideRect,
): GuideRect | null {
  if (
    ![target.x, target.y, target.width, target.height].every(Number.isFinite) ||
    target.width <= 0 ||
    target.height <= 0
  )
    return null;
  const x = clamp(target.x - root.x - 6, 8, root.width - 8);
  const y = clamp(target.y - root.y - 6, 8, root.height - 8);
  const right = clamp(target.x - root.x + target.width + 6, 8, root.width - 8);
  const bottom = clamp(
    target.y - root.y + target.height + 6,
    8,
    root.height - 8,
  );
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function guideCardLayout(
  target: GuideRect | null,
  viewport: GuideViewport,
  measuredHeight: number,
) {
  const margin = 16;
  const width = Math.max(0, Math.min(380, viewport.width - margin * 2));
  const minY = viewport.top + 12;
  const maxBottom = viewport.height - viewport.bottom - 12;
  const height = Math.min(measuredHeight, Math.max(0, maxBottom - minY));
  const targetCenter = target
    ? target.x + target.width / 2
    : viewport.width / 2;
  const x = clamp(
    targetCenter - width / 2,
    margin,
    viewport.width - width - margin,
  );
  const below = target
    ? target.y + target.height + 14
    : (minY + maxBottom - height) / 2;
  const above = target ? target.y - height - 14 : below;
  const roomBelow = target ? maxBottom - target.y - target.height : 0;
  const roomAbove = target ? target.y - minY : 0;
  const side =
    !target || roomBelow >= height + 14 || roomBelow >= roomAbove
      ? 'below'
      : 'above';
  const y = clamp(side === 'below' ? below : above, minY, maxBottom - height);
  // Hide the pointer in constrained layouts instead of pointing through the card.
  const pointer =
    !!target &&
    (side === 'below' ? y >= target.y + target.height : y + height <= target.y);
  return {
    x,
    y,
    width,
    maxHeight: Math.max(0, maxBottom - minY),
    side,
    pointer,
    arrowX: clamp(targetCenter - x, 22, width - 22),
  };
}

export function guideScrollOffset(
  target: GuideRect,
  viewport: GuideRect,
  current: number,
  contentHeight: number,
  cardHeight: number,
) {
  const desiredTop = Math.max(
    20,
    (viewport.height -
      Math.min(cardHeight + 40, viewport.height * 0.6) -
      Math.min(target.height, viewport.height * 0.45)) /
      2,
  );
  return clamp(
    current + target.y - viewport.y - desiredTop,
    0,
    contentHeight - viewport.height,
  );
}
