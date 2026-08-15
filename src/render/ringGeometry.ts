/**
 * Inner hole radius for a ring. Wall thickness is absolute (keyed to one grid
 * cell), so every ring in the frame shares the same stroke width.
 * Returns 0 when the shape should be drawn as a solid disc.
 */
export function ringInnerRadius(
  outerR: number,
  ringThickness: number,
  cellSize: number,
): number {
  if (outerR <= 0 || cellSize <= 0) return 0;
  if (ringThickness >= 100) return 0;

  const holeRatio = Math.min(0.95, Math.max(0.05, (100 - ringThickness) / 100));
  // Match the previous 1×1-cell look; larger rings keep this same absolute wall.
  const stroke = Math.max(2, (cellSize / 2) * (1 - holeRatio));
  const innerR = outerR - stroke;
  return innerR > 0 ? innerR : 0;
}
