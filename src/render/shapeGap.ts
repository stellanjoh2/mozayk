import type { PixelRect } from "../grid/gridMath";

/** At 100, each side is inset by 12.5% of cell size — 25% gutter between neighbours. */
export const SHAPE_GAP_MAX_CELL_INSET = 0.125;

/** Uniform pixel inset per side. 0 = flush · 100 = 12.5% of cellSize. */
export function shapeGapInsetPx(
  amount: number | undefined,
  cellSize: number,
): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || cellSize <= 0) return 0;
  const t = Math.min(1, n / 100);
  return t * cellSize * SHAPE_GAP_MAX_CELL_INSET;
}

/** Inset a rect equally on all sides. Amount 0 is a no-op. */
export function insetPixelRect(
  rect: PixelRect,
  amount: number | undefined,
  cellSize: number,
): PixelRect {
  const inset = shapeGapInsetPx(amount, cellSize);
  if (inset <= 0) return rect;
  const width = Math.max(0, rect.width - inset * 2);
  const height = Math.max(0, rect.height - inset * 2);
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width,
    height,
  };
}

/** Inset a plus so each arm keeps the same uniform gap. */
export function insetCrossRects(
  horizontal: PixelRect,
  vertical: PixelRect,
  amount: number | undefined,
  cellSize: number,
): { horizontal: PixelRect; vertical: PixelRect } {
  return {
    horizontal: insetPixelRect(horizontal, amount, cellSize),
    vertical: insetPixelRect(vertical, amount, cellSize),
  };
}
