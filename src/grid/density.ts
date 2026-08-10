import type { Density, Orientation } from "../types";

/** Reference density — default size slider values are tuned for this level. */
export const REFERENCE_DENSITY = 3;

export const MAX_DENSITY = 8 as const;

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
  { level: 7, label: "7", landscape: { columns: 112, rows: 63 }, cellPx1080: 17 },
  { level: 8, label: "8", landscape: { columns: 128, rows: 72 }, cellPx1080: 15 },
];

export function densityScale(density: Density): number {
  return density / REFERENCE_DENSITY;
}

/** Scale a grid-unit size from reference density to target density. */
export function scaleGridUnits(value: number, density: Density): number {
  return Math.max(1, Math.round(value * densityScale(density)));
}

export function maxCellSizeSliderMax(
  density: Density,
  orientation: Orientation,
): number {
  const columns = orientation === "landscape" ? 16 * density : 9 * density;
  const rows = orientation === "landscape" ? 9 * density : 16 * density;
  return Math.min(Math.max(columns, rows), scaleGridUnits(24, density));
}

export function maxWidthSliderMax(
  density: Density,
  orientation: Orientation,
): number {
  return orientation === "landscape" ? 16 * density : 9 * density;
}

export function maxHeightSliderMax(
  density: Density,
  orientation: Orientation,
): number {
  return orientation === "landscape" ? 9 * density : 16 * density;
}

/** @deprecated use maxCellSizeSliderMax(density, orientation) */
export function maxSpanSliderMax(
  density: Density,
  orientation: Orientation,
): number {
  return maxWidthSliderMax(density, orientation);
}

export function canDoubleDensity(density: Density): boolean {
  return density * 2 <= MAX_DENSITY;
}

export function canHalveDensity(density: Density): boolean {
  return density % 2 === 0 && density > 1;
}

export function toggleDoubleGrid(density: Density): Density {
  if (canDoubleDensity(density)) return (density * 2) as Density;
  if (canHalveDensity(density)) return (density / 2) as Density;
  return density;
}
