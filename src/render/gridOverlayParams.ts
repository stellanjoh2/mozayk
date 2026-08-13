import type { GridBlendMode, GridOverlayStroke } from "../types";

export const GRID_OVERLAY_STROKES: readonly GridOverlayStroke[] = [1, 2, 4];

export const GRID_BLEND_MODES: readonly GridBlendMode[] = [
  "normal",
  "difference",
  "screen",
];

export const GRID_BLEND_LABELS: Record<GridBlendMode, string> = {
  normal: "Normal",
  difference: "Difference",
  screen: "Screen",
};

export function resolveGridOverlayStroke(
  value: unknown,
  fallback: GridOverlayStroke = 2,
): GridOverlayStroke {
  const n = Number(value);
  return GRID_OVERLAY_STROKES.includes(n as GridOverlayStroke)
    ? (n as GridOverlayStroke)
    : fallback;
}

/** Accepts blend string, or legacy `*Difference` boolean via `legacyDifference`. */
export function resolveGridBlendMode(
  value: unknown,
  legacyDifference?: unknown,
): GridBlendMode {
  if (typeof value === "string" && GRID_BLEND_MODES.includes(value as GridBlendMode)) {
    return value as GridBlendMode;
  }
  return legacyDifference ? "difference" : "normal";
}

export const GRID_CROSS_SIZE_MIN = 2;
export const GRID_CROSS_SIZE_MAX = 64;
export const GRID_CROSS_SIZE_DEFAULT = 24;

export function resolveGridCrossSize(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return GRID_CROSS_SIZE_DEFAULT;
  return Math.min(
    GRID_CROSS_SIZE_MAX,
    Math.max(GRID_CROSS_SIZE_MIN, Math.round(n)),
  );
}
