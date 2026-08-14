import { normalizeHex } from "../colorMath";
import { getGridDimensions, gridEdge } from "../grid/gridMath";
import type {
  Density,
  FrameSettings,
  GridBlendMode,
  GridDimensions,
  GridOverlayStroke,
  Orientation,
} from "../types";
import {
  GRID_CROSS_SIZE_DEFAULT,
  resolveGridBlendMode,
  resolveGridCrossSize,
  resolveGridOverlayStroke,
} from "./gridOverlayParams";

export {
  GRID_BLEND_MODES,
  GRID_CROSS_SIZE_DEFAULT,
  GRID_CROSS_SIZE_MAX,
  GRID_CROSS_SIZE_MIN,
  GRID_OVERLAY_STROKES,
  resolveGridBlendMode,
  resolveGridCrossSize,
  resolveGridOverlayStroke,
} from "./gridOverlayParams";

export type GridOverlayStyle = {
  density: Density;
  color: string;
  /** Stroke width in px (1, 2, or 4). */
  lineWidth: GridOverlayStroke;
  /** 0–1 */
  opacity: number;
  blendMode: GridBlendMode;
  /** 0–100; 0 = perfect square hatch */
  chaos: number;
  /** Cross arm span in px. Unused for lines. */
  size?: number;
};

export function resolveGridOverlayStyle(
  settings: FrameSettings,
): GridOverlayStyle | null {
  if (!settings.gridOverlay) return null;

  const opacityRaw = settings.gridOverlayOpacity ?? 100;
  const chaosRaw = settings.gridOverlayChaos ?? 0;
  return {
    density: settings.gridOverlayDensity ?? 1,
    color: normalizeHex(settings.gridOverlayColor, "#ffffff"),
    lineWidth: resolveGridOverlayStroke(settings.gridOverlayStroke),
    opacity: Math.min(100, Math.max(0, opacityRaw)) / 100,
    blendMode: resolveGridBlendMode(settings.gridOverlayBlend),
    chaos: Math.min(100, Math.max(0, chaosRaw)),
  };
}

export function resolveGridCrossesStyle(
  settings: FrameSettings,
): GridOverlayStyle | null {
  if (!settings.gridCrosses) return null;

  const opacityRaw = settings.gridCrossesOpacity ?? 100;
  const chaosRaw = settings.gridCrossesChaos ?? 0;
  return {
    density: settings.gridCrossesDensity ?? 1,
    color: normalizeHex(settings.gridCrossesColor, "#ffffff"),
    lineWidth: resolveGridOverlayStroke(settings.gridCrossesStroke),
    opacity: Math.min(100, Math.max(0, opacityRaw)) / 100,
    blendMode: resolveGridBlendMode(settings.gridCrossesBlend),
    chaos: Math.min(100, Math.max(0, chaosRaw)),
    size: resolveGridCrossSize(settings.gridCrossesSize),
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

function hashSeed(...values: number[]): number {
  let h = 2166136261;
  for (const value of values) {
    h ^= value | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perfectGridPathData(grid: GridDimensions): string {
  const { columns, rows, width, height } = grid;
  const parts: string[] = [];

  for (let c = 1; c < columns; c++) {
    const x = gridEdge(c, columns, width);
    parts.push(`M ${x} -1 V ${height + 1}`);
  }
  for (let r = 1; r < rows; r++) {
    const y = gridEdge(r, rows, height);
    parts.push(`M -1 ${y} H ${width + 1}`);
  }

  return parts.join(" ");
}

function edgeKey(a: number, b: number): string {
  return `${a},${b}`;
}

function parseEdgeKey(key: string): [number, number] {
  const i = key.indexOf(",");
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
}

/**
 * Broken hatch as a lattice edge subset: remove + U-detour, then prune any
 * interior degree-1 stubs so every stroke ends at a junction or the canvas edge.
 */
function brokenGridPathData(grid: GridDimensions, chaos: number): string {
  const { columns, rows, width, height } = grid;
  const t = chaos / 100;
  const rng = mulberry32(hashSeed(columns, rows, width, height, chaos));

  const hEdges = new Set<string>();
  const vEdges = new Set<string>();

  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < columns; c++) hEdges.add(edgeKey(c, r));
  }
  for (let c = 1; c < columns; c++) {
    for (let r = 0; r < rows; r++) vEdges.add(edgeKey(c, r));
  }

  const jogRate = t * 0.28;
  for (const key of [...hEdges]) {
    if (rng() >= jogRate) continue;
    const [c, r] = parseEdgeKey(key);
    const down = rng() < 0.5;
    const r2 = down ? r + 1 : r - 1;
    if (r2 < 1 || r2 > rows - 1) continue;
    if (c < 1 || c + 1 > columns - 1) continue;
    if (!hEdges.has(key)) continue;
    hEdges.delete(key);
    hEdges.add(edgeKey(c, r2));
    vEdges.add(edgeKey(c, Math.min(r, r2)));
    vEdges.add(edgeKey(c + 1, Math.min(r, r2)));
  }

  for (const key of [...vEdges]) {
    if (rng() >= jogRate) continue;
    const [c, r] = parseEdgeKey(key);
    const right = rng() < 0.5;
    const c2 = right ? c + 1 : c - 1;
    if (c2 < 1 || c2 > columns - 1) continue;
    if (r < 1 || r + 1 > rows - 1) continue;
    if (!vEdges.has(key)) continue;
    vEdges.delete(key);
    vEdges.add(edgeKey(c2, r));
    hEdges.add(edgeKey(Math.min(c, c2), r));
    hEdges.add(edgeKey(Math.min(c, c2), r + 1));
  }

  const removeRate = t * 0.55;
  for (const key of [...hEdges]) {
    if (rng() < removeRate) hEdges.delete(key);
  }
  for (const key of [...vEdges]) {
    if (rng() < removeRate) vEdges.delete(key);
  }

  const isBoundary = (c: number, r: number) =>
    c === 0 || c === columns || r === 0 || r === rows;

  const degree = (c: number, r: number): number => {
    let d = 0;
    if (c > 0 && hEdges.has(edgeKey(c - 1, r))) d++;
    if (c < columns && hEdges.has(edgeKey(c, r))) d++;
    if (r > 0 && vEdges.has(edgeKey(c, r - 1))) d++;
    if (r < rows && vEdges.has(edgeKey(c, r))) d++;
    return d;
  };

  const removeIncident = (c: number, r: number): boolean => {
    if (c > 0 && hEdges.delete(edgeKey(c - 1, r))) return true;
    if (c < columns && hEdges.delete(edgeKey(c, r))) return true;
    if (r > 0 && vEdges.delete(edgeKey(c, r - 1))) return true;
    if (r < rows && vEdges.delete(edgeKey(c, r))) return true;
    return false;
  };

  let pruning = true;
  while (pruning) {
    pruning = false;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= columns; c++) {
        if (isBoundary(c, r)) continue;
        if (degree(c, r) !== 1) continue;
        if (removeIncident(c, r)) pruning = true;
      }
    }
  }

  const xAt = (c: number) =>
    c === 0 ? -1 : c === columns ? width + 1 : gridEdge(c, columns, width);
  const yAt = (r: number) =>
    r === 0 ? -1 : r === rows ? height + 1 : gridEdge(r, rows, height);

  const parts: string[] = [];
  for (const key of hEdges) {
    const [c, r] = parseEdgeKey(key);
    const y = yAt(r);
    parts.push(`M ${xAt(c)} ${y} H ${xAt(c + 1)}`);
  }
  for (const key of vEdges) {
    const [c, r] = parseEdgeKey(key);
    const x = xAt(c);
    parts.push(`M ${x} ${yAt(r)} V ${yAt(r + 1)}`);
  }

  return parts.join(" ");
}

/** Interior hatches only — no outer frame; lines bleed 1px past the canvas. */
export function gridOverlayPathData(
  grid: GridDimensions,
  chaos = 0,
): string {
  if (chaos <= 0) return perfectGridPathData(grid);
  return brokenGridPathData(grid, Math.min(100, chaos));
}

/** Pluses on interior hatch intersections. Size is full arm span in px. */
export function gridCrossesPathData(
  grid: GridDimensions,
  chaos = 0,
  size = GRID_CROSS_SIZE_DEFAULT,
): string {
  const { columns, rows, width, height } = grid;
  const half = resolveGridCrossSize(size) / 2;
  const t = Math.min(100, Math.max(0, chaos)) / 100;
  const rng =
    t > 0
      ? mulberry32(hashSeed(columns, rows, width, height, chaos, 8))
      : null;
  const dropRate = t * 0.55;
  const parts: string[] = [];

  for (let c = 1; c < columns; c++) {
    const x = gridEdge(c, columns, width);
    for (let r = 1; r < rows; r++) {
      if (rng && rng() < dropRate) continue;
      const y = gridEdge(r, rows, height);
      parts.push(
        `M ${x - half} ${y} H ${x + half} M ${x} ${y - half} V ${y + half}`,
      );
    }
  }

  return parts.join(" ");
}
