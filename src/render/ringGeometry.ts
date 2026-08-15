import { blockPixelRect } from "../grid/gridMath";
import type { GridDimensions, MosaicBlock } from "../types";

function ringOuterRadius(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
): number {
  const { width, height } = blockPixelRect(grid, block);
  return Math.min(width, height) / 2;
}

/** Largest ring radius in the frame — thickness 100 fills this size. */
export function largestRingRadius(
  blocks: MosaicBlock[],
  grid: GridDimensions,
): number {
  let maxR = 0;
  for (const block of blocks) {
    if (block.shape !== "ring") continue;
    const r = ringOuterRadius(grid, block);
    if (r > maxR) maxR = r;
  }
  return maxR;
}

/**
 * Inner hole radius for a ring. Wall thickness is absolute, so every ring
 * shares the same stroke. `fillRadius` is the radius that becomes solid at
 * 100 (the largest ring in the frame) so the slider grows smoothly instead
 * of barely moving, then snapping shut.
 * Returns 0 when the shape should be drawn as a solid disc.
 */
export function ringInnerRadius(
  outerR: number,
  ringThickness: number,
  cellSize: number,
  fillRadius: number = outerR,
): number {
  if (outerR <= 0 || cellSize <= 0) return 0;

  const t = Math.min(1, Math.max(0, ringThickness / 100));
  if (t >= 1) return 0;

  const maxStroke = Math.max(outerR, fillRadius);
  const minStroke = Math.min(Math.max(2, cellSize * 0.05), maxStroke * 0.2);
  const stroke = minStroke + t * (maxStroke - minStroke);
  const innerR = outerR - stroke;
  return innerR > 0 ? innerR : 0;
}
