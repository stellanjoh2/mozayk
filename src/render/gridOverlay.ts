import { normalizeHex } from "../colorMath";
import { getGridDimensions } from "../grid/gridMath";
import type {
  Density,
  FrameSettings,
  GridDimensions,
  Orientation,
} from "../types";

export type GridOverlayStyle = {
  density: Density;
  color: string;
  /** 0–1 */
  opacity: number;
  difference: boolean;
};

export function resolveGridOverlayStyle(
  settings: FrameSettings,
): GridOverlayStyle | null {
  if (!settings.gridOverlay) return null;

  const opacityRaw = settings.gridOverlayOpacity ?? 100;
  return {
    density: settings.gridOverlayDensity ?? settings.density,
    color: normalizeHex(settings.gridOverlayColor, "#ffffff"),
    opacity: Math.min(100, Math.max(0, opacityRaw)) / 100,
    difference: Boolean(settings.gridOverlayDifference),
  };
}

export function gridOverlayDimensions(
  orientation: Orientation,
  width: number,
  height: number,
  style: GridOverlayStyle,
): GridDimensions {
  return getGridDimensions(orientation, style.density, width, height);
}

/** Interior hatches only — no outer frame; lines bleed 1px past the canvas. */
export function gridOverlayPathData(grid: GridDimensions): string {
  const { columns, rows, width, height } = grid;
  const parts: string[] = [];

  for (let c = 1; c < columns; c++) {
    const x = Math.round((c / columns) * width);
    parts.push(`M ${x} -1 V ${height + 1}`);
  }
  for (let r = 1; r < rows; r++) {
    const y = Math.round((r / rows) * height);
    parts.push(`M -1 ${y} H ${width + 1}`);
  }

  return parts.join(" ");
}
