import type { Density, Orientation } from "../types";

/** Reference density — default size slider values are tuned for this level. */
export const REFERENCE_DENSITY = 3;

/** Allowed grid densities (7 and 9 dropped — uneven cell widths). */
export const DENSITIES = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const satisfies readonly Density[];

export const MAX_DENSITY = 12 as const;

export type DensityInfo = {
  level: Density;
  label: string;
  landscape: { columns: number; rows: number };
  cellPx1080: number;
};

export const DENSITY_INFO: DensityInfo[] = [
  { level: 1, label: "1", landscape: { columns: 16, rows: 9 }, cellPx1080: 120 },
  { level: 2, label: "2", landscape: { columns: 32, rows: 18 }, cellPx1080: 60 },
  { level: 3, label: "3", landscape: { columns: 48, rows: 27 }, cellPx1080: 40 },
  { level: 4, label: "4", landscape: { columns: 64, rows: 36 }, cellPx1080: 30 },
  { level: 5, label: "5", landscape: { columns: 80, rows: 45 }, cellPx1080: 24 },
  { level: 6, label: "6", landscape: { columns: 96, rows: 54 }, cellPx1080: 20 },
  { level: 8, label: "8", landscape: { columns: 128, rows: 72 }, cellPx1080: 15 },
  { level: 10, label: "10", landscape: { columns: 160, rows: 90 }, cellPx1080: 12 },
  { level: 12, label: "12", landscape: { columns: 192, rows: 108 }, cellPx1080: 10 },
];

export function isDensity(value: number): value is Density {
  return (DENSITIES as readonly number[]).includes(value);
}

/** Map legacy / out-of-range values (e.g. 7, 9) to the nearest allowed density. */
export function clampDensity(value: number, fallback: Density = 5): Density {
  if (isDensity(value)) return value;
  if (!Number.isFinite(value)) return fallback;
  let best: Density = fallback;
  let bestDist = Infinity;
  for (const d of DENSITIES) {
    const dist = Math.abs(d - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

export function densityScale(density: Density): number {
  return density / REFERENCE_DENSITY;
}

/** Scale a grid-unit size from reference density to target density. */
export function scaleGridUnits(value: number, density: Density): number {
  return Math.max(1, Math.round(value * densityScale(density)));
}

/** Internal similar-size floor for scale blend (not user-facing). */
export function defaultMinCellSize(): number {
  return 1;
}

/** Internal similar-size ceiling for scale blend (not user-facing). */
export function defaultMaxCellSize(density: Density): number {
  return scaleGridUnits(6, density);
}

export function maxWidthSliderMax(
  density: Density,
  orientation: Orientation,
): number {
  if (orientation === "landscape") return 16 * density;
  return 9 * density;
}

export function maxHeightSliderMax(
  density: Density,
  orientation: Orientation,
): number {
  if (orientation === "landscape") return 9 * density;
  if (orientation === "portrait") return 16 * density;
  return 9 * density;
}

export function canDoubleDensity(density: Density): boolean {
  return isDensity(density * 2);
}

export function canHalveDensity(density: Density): boolean {
  return density % 2 === 0 && density > 1 && isDensity(density / 2);
}

export function toggleDoubleGrid(density: Density): Density {
  if (canDoubleDensity(density)) return (density * 2) as Density;
  if (canHalveDensity(density)) return (density / 2) as Density;
  return density;
}
