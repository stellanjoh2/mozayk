import type { GridOverlayStroke } from "../types";

export const GRID_OVERLAY_STROKES: readonly GridOverlayStroke[] = [1, 2, 4];

export function resolveGridOverlayStroke(
  value: unknown,
  fallback: GridOverlayStroke = 2,
): GridOverlayStroke {
  const n = Number(value);
  return GRID_OVERLAY_STROKES.includes(n as GridOverlayStroke)
    ? (n as GridOverlayStroke)
    : fallback;
}

export const GRID_CROSS_SIZE_MIN = 2;
export const GRID_CROSS_SIZE_MAX = 64;
export const GRID_CROSS_SIZE_DEFAULT = 8;

export function resolveGridCrossSize(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return GRID_CROSS_SIZE_DEFAULT;
  return Math.min(
    GRID_CROSS_SIZE_MAX,
    Math.max(GRID_CROSS_SIZE_MIN, Math.round(n)),
  );
}
