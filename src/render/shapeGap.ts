import type { PixelRect } from "../grid/gridMath";

/** At 100, shapes are 25% smaller — a 12.5% margin on each side. */
export const SHAPE_GAP_MAX_SCALE_DOWN = 0.25;

/** Uniform scale for a shape. 0 = 1 · 100 = 0.75. */
export function shapeGapScale(amount: number | undefined): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const t = Math.min(1, n / 100);
  return 1 - SHAPE_GAP_MAX_SCALE_DOWN * t;
}

/** Scale a rect toward its centre. Amount 0 is a no-op. */
export function scalePixelRect(
  rect: PixelRect,
  amount: number | undefined,
): PixelRect {
  const scale = shapeGapScale(amount);
  if (scale >= 1) return rect;
  const width = rect.width * scale;
  const height = rect.height * scale;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

function scaleAround(
  rect: PixelRect,
  originX: number,
  originY: number,
  scale: number,
): PixelRect {
  return {
    x: originX + (rect.x - originX) * scale,
    y: originY + (rect.y - originY) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** Scale a plus as one shape so the arms stay joined. */
export function scaleCrossRects(
  horizontal: PixelRect,
  vertical: PixelRect,
  amount: number | undefined,
): { horizontal: PixelRect; vertical: PixelRect } {
  const scale = shapeGapScale(amount);
  if (scale >= 1) return { horizontal, vertical };
  const x1 = Math.min(horizontal.x, vertical.x);
  const y1 = Math.min(horizontal.y, vertical.y);
  const x2 = Math.max(
    horizontal.x + horizontal.width,
    vertical.x + vertical.width,
  );
  const y2 = Math.max(
    horizontal.y + horizontal.height,
    vertical.y + vertical.height,
  );
  const ox = (x1 + x2) / 2;
  const oy = (y1 + y2) / 2;
  return {
    horizontal: scaleAround(horizontal, ox, oy, scale),
    vertical: scaleAround(vertical, ox, oy, scale),
  };
}
