/** Pixel corner radius for a box. 0 = square · 100 = pill (half the shorter side). */
export function blockCornerRadiusPx(
  width: number,
  height: number,
  amount: number | undefined,
): number {
  if (width <= 0 || height <= 0) return 0;
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const t = Math.min(1, n / 100);
  return (t * Math.min(width, height)) / 2;
}
