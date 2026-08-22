import { hsvToHex } from "../colorMath";
import { getGridCounts } from "../grid/gridMath";
import { assignShape } from "../shapes/shapePalette";
import type {
  Density,
  FrameSettings,
  MosaicBlock,
  Orientation,
} from "../types";

export type Rng = () => number;

const WEIGHT_FLOOR = 0.05;

/**
 * Spatial weight for a column: 0 = left-heavy, 50 = even, 100 = right-heavy.
 * Returns 0..1 — higher means blocks are more likely (and larger) here.
 */
function columnPlacementBias(
  col: number,
  columns: number,
  weight: number,
): number {
  if (columns <= 1) return 1;

  const t = weight / 100;
  if (Math.abs(t - 0.5) < 0.02) return 1;

  const colNorm = col / (columns - 1);
  const strength = Math.min(1, Math.abs(t - 0.5) * 2);
  const affinity = t < 0.5 ? 1 - colNorm : colNorm;
  const weighted = 1 - strength + strength * affinity;

  return WEIGHT_FLOOR + (1 - WEIGHT_FLOOR) * weighted;
}

/** Scale blend 0..6 → contrast 0..1 (similar → large+small). */
function contrastFromScaleBlend(scaleBlend: number): number {
  return Math.min(1, Math.max(0, scaleBlend / 6));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pickInRange(rng: Rng, lo: number, hi: number, favorHigh: number): number {
  if (hi <= lo) return lo;
  // favorHigh 0 → bias low, 1 → bias high
  const exponent = 0.35 + (1 - favorHigh) * 2.8;
  const u = Math.pow(rng(), exponent);
  return Math.min(hi, lo + Math.floor(u * (hi - lo + 1)));
}

type SizeBand = "auto" | "large" | "small";

/**
 * At low contrast, giants stay near Max Cell Size.
 * At high contrast, they open up toward Max Width / Max Height (axis caps).
 */
function largeSpanCeiling(
  maxCellSize: number,
  axisMax: number,
  contrast: number,
): number {
  return Math.max(
    1,
    Math.round(lerp(maxCellSize, Math.max(maxCellSize, axisMax), contrast)),
  );
}

function clampBlockSize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Pick width/height with contrast bands; optional forced large/small pass. */
function pickBlockDimensions(
  rng: Rng,
  maxW: number,
  maxH: number,
  minCellSize: number,
  maxCellSize: number,
  scaleBlend: number,
  spatialBias: number,
  randomWidth: boolean,
  randomHeight: boolean,
  band: SizeBand = "auto",
): { width: number; height: number } {
  if (!randomWidth && !randomHeight) {
    return { width: 1, height: 1 };
  }

  const t = contrastFromScaleBlend(scaleBlend);
  const axisCap = Math.max(maxW, maxH);
  const largeHi = Math.min(
    axisCap,
    largeSpanCeiling(maxCellSize, axisCap, t),
  );
  const lo = Math.min(Math.max(1, minCellSize), largeHi);
  const mid = Math.round(lerp(lo, Math.min(maxCellSize, largeHi), 0.5));

  const smallLo = Math.round(lerp(mid, lo, t));
  const smallHi = Math.round(lerp(mid, lerp(lo, mid, 0.4), t));
  const sLo = Math.min(smallLo, smallHi);
  const sHi = Math.max(lo, Math.max(smallLo, smallHi));

  const lLo = Math.round(lerp(mid, lerp(mid, largeHi, 0.55), t));
  const lHi = largeHi;
  const largeLo = Math.min(lLo, lHi);
  const largeHiClamped = Math.max(lLo, lHi);

  const largeChance = t * (0.35 + 0.45 * spatialBias);
  const useLarge =
    band === "large" || (band === "auto" && t > 0 && rng() < largeChance);

  if (randomWidth && !randomHeight) {
    const hi = useLarge ? Math.min(maxW, largeHiClamped) : Math.min(maxW, sHi);
    const picked = useLarge
      ? pickInRange(rng, Math.min(largeLo, hi), hi, 0.7 + 0.3 * t)
      : pickInRange(rng, Math.min(sLo, hi), hi, 0.3 * (1 - t));
    return {
      width: clampBlockSize(picked, lo, maxW),
      height: 1,
    };
  }

  if (!randomWidth && randomHeight) {
    const hi = useLarge ? Math.min(maxH, largeHiClamped) : Math.min(maxH, sHi);
    const picked = useLarge
      ? pickInRange(rng, Math.min(largeLo, hi), hi, 0.7 + 0.3 * t)
      : pickInRange(rng, Math.min(sLo, hi), hi, 0.3 * (1 - t));
    return {
      width: 1,
      height: clampBlockSize(picked, lo, maxH),
    };
  }

  if (useLarge) {
    // Simple large blocks: one long axis, the other stays small/detail-sized.
    const primaryHi = largeHiClamped;
    const primary = pickInRange(
      rng,
      Math.min(largeLo, primaryHi),
      primaryHi,
      0.75 + 0.25 * t,
    );
    const secondary = pickInRange(rng, sLo, sHi, 0.2);
    if (rng() < 0.55) {
      return {
        width: Math.min(maxW, Math.max(lo, primary)),
        height: Math.min(maxH, Math.max(1, secondary)),
      };
    }
    return {
      width: Math.min(maxW, Math.max(1, secondary)),
      height: Math.min(maxH, Math.max(lo, primary)),
    };
  }

  // Small / similar band — stay within Max Cell Size.
  const sizeHi = Math.min(maxW, maxH, maxCellSize, sHi);
  const size = pickInRange(rng, Math.min(sLo, sizeHi), sizeHi, 0.3 * (1 - t));
  if (rng() < 0.5) {
    return {
      width: Math.min(maxW, size),
      height: Math.min(maxH, Math.max(1, pickInRange(rng, 1, Math.min(maxH, size), 0.3))),
    };
  }
  return {
    width: Math.min(maxW, Math.max(1, pickInRange(rng, 1, Math.min(maxW, size), 0.3))),
    height: Math.min(maxH, size),
  };
}

/** Largest free axis-aligned rect with top-left at (row, col). */
function freeRectFrom(
  occupied: boolean[][],
  row: number,
  col: number,
  rows: number,
  columns: number,
): { width: number; height: number } {
  let width = 0;
  while (col + width < columns && !occupied[row][col + width]) {
    width++;
  }
  if (width === 0) return { width: 0, height: 0 };

  let height = 1;
  for (let r = row + 1; r < rows; r++) {
    for (let c = col; c < col + width; c++) {
      if (occupied[r][c]) return { width, height };
    }
    height++;
  }
  return { width, height };
}

function fitsBlock(
  width: number,
  height: number,
  minCellSize: number,
  spanCeiling: number,
): boolean {
  const size = Math.max(width, height);
  return size >= minCellSize && size <= spanCeiling;
}

function canPlace(
  occupied: boolean[][],
  row: number,
  col: number,
  width: number,
  height: number,
  rows: number,
  columns: number,
): boolean {
  if (col + width > columns || row + height > rows) return false;
  for (let r = row; r < row + height; r++) {
    for (let c = col; c < col + width; c++) {
      if (occupied[r][c]) return false;
    }
  }
  return true;
}

function markOccupied(
  occupied: boolean[][],
  row: number,
  col: number,
  width: number,
  height: number,
): void {
  for (let r = row; r < row + height; r++) {
    for (let c = col; c < col + width; c++) {
      occupied[r][c] = true;
    }
  }
}

export function rerollShapes(
  blocks: MosaicBlock[],
  settings: FrameSettings,
  rng: Rng = Math.random,
): MosaicBlock[] {
  return blocks.map((block) => ({
    ...block,
    shape: assignShape(settings, rng),
  }));
}

export const LAYOUT_SETTING_KEYS = [
  "density",
  "fillAmount",
  "weight",
  "scaleBlend",
  "minCellSize",
  "maxCellSize",
  "maxHeight",
  "randomHeight",
  "maxWidth",
  "randomWidth",
] as const satisfies readonly (keyof FrameSettings)[];

/** Settings that actually reshape an imported (photo-mapped) layout. */
export const IMPORTED_LAYOUT_SETTING_KEYS = [
  "density",
  "fillAmount",
  "scaleBlend",
] as const satisfies readonly (keyof FrameSettings)[];

export function patchNeedsLayoutRegen(
  patch: Partial<FrameSettings>,
): boolean {
  return LAYOUT_SETTING_KEYS.some((key) => key in patch);
}

export function patchNeedsImportedLayoutRegen(
  patch: Partial<FrameSettings>,
): boolean {
  return IMPORTED_LAYOUT_SETTING_KEYS.some((key) => key in patch);
}

function placeLayoutPass(
  occupied: boolean[][],
  blocks: MosaicBlock[],
  columns: number,
  rows: number,
  settings: FrameSettings,
  rng: Rng,
  band: SizeBand,
  fillScale: number,
): void {
  const contrast = contrastFromScaleBlend(settings.scaleBlend);
  const axisCap = Math.max(
    settings.randomWidth ? settings.maxWidth : 1,
    settings.randomHeight ? settings.maxHeight : 1,
  );
  const spanCeiling = largeSpanCeiling(
    settings.maxCellSize,
    axisCap,
    contrast,
  );

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (occupied[row][col]) continue;

      const spatialBias = columnPlacementBias(col, columns, settings.weight);
      const placeChance =
        (settings.fillAmount / 100) * spatialBias * fillScale;
      if (rng() > placeChance) continue;

      const free = freeRectFrom(occupied, row, col, rows, columns);
      const maxW = settings.randomWidth
        ? Math.min(settings.maxWidth, free.width)
        : 1;
      const maxH = settings.randomHeight
        ? Math.min(settings.maxHeight, free.height)
        : 1;
      if (maxW < 1 || maxH < 1) continue;

      // Large pass needs room; skip crumbs so giants stay simple.
      if (band === "large") {
        const minGiant = Math.max(
          settings.minCellSize,
          Math.round(lerp(settings.maxCellSize, settings.maxCellSize * 0.5, contrast)),
        );
        if (Math.max(maxW, maxH) < minGiant) continue;
      }

      let width = 1;
      let height = 1;
      let placed = false;

      for (let attempt = 0; attempt < 16; attempt++) {
        ({ width, height } = pickBlockDimensions(
          rng,
          maxW,
          maxH,
          settings.minCellSize,
          settings.maxCellSize,
          settings.scaleBlend,
          spatialBias,
          settings.randomWidth,
          settings.randomHeight,
          band,
        ));

        if (!fitsBlock(width, height, settings.minCellSize, spanCeiling)) {
          continue;
        }
        if (!canPlace(occupied, row, col, width, height, rows, columns)) {
          continue;
        }
        placed = true;
        break;
      }

      if (!placed) {
        if (band === "large") continue;
        const fallbackSize = Math.min(
          settings.minCellSize,
          settings.maxCellSize,
          maxW,
          maxH,
        );
        if (
          fallbackSize >= 1 &&
          canPlace(
            occupied,
            row,
            col,
            fallbackSize,
            fallbackSize,
            rows,
            columns,
          )
        ) {
          width = fallbackSize;
          height = fallbackSize;
        } else if (canPlace(occupied, row, col, 1, 1, rows, columns)) {
          width = 1;
          height = 1;
        } else {
          continue;
        }
      }

      markOccupied(occupied, row, col, width, height);
      blocks.push({
        col,
        row,
        width,
        height,
        shape: assignShape(settings, rng),
        color: "",
      });
    }
  }
}

export function generateLayout(
  orientation: Orientation,
  settings: FrameSettings,
  rng: Rng = Math.random,
): MosaicBlock[] {
  const { columns, rows } = getGridCounts(orientation, settings.density);
  if (columns <= 0 || rows <= 0) return [];
  const occupied = Array.from({ length: rows }, () =>
    Array<boolean>(columns).fill(false),
  );
  const blocks: MosaicBlock[] = [];
  const contrast = contrastFromScaleBlend(settings.scaleBlend);

  // Macro first so large simple blocks claim space; detail fills gaps after.
  if (contrast > 0.08) {
    placeLayoutPass(
      occupied,
      blocks,
      columns,
      rows,
      settings,
      rng,
      "large",
      0.4 + contrast * 0.9,
    );
    placeLayoutPass(
      occupied,
      blocks,
      columns,
      rows,
      settings,
      rng,
      "small",
      1,
    );
  } else {
    placeLayoutPass(
      occupied,
      blocks,
      columns,
      rows,
      settings,
      rng,
      "auto",
      1,
    );
  }

  return blocks;
}

export function pickWeightedColor(
  colors: string[],
  amounts: number[] | undefined,
  rng: Rng,
): string {
  if (colors.length === 0) return "#ffffff";
  const weights =
    amounts && amounts.length === colors.length
      ? amounts.map((amount) => Math.max(0, amount))
      : colors.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return colors[0];
  let roll = rng() * total;
  for (let i = 0; i < colors.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return colors[i];
  }
  return colors[colors.length - 1];
}

function shuffleInPlace<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/** Largest-remainder counts so Amount weights become an exact mix, not a dice roll. */
function weightedCounts(weights: number[], total: number): number[] {
  const safe = weights.map((weight) => Math.max(0, weight));
  const weightTotal = safe.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return safe.map(() => 0);
  if (weightTotal <= 0) {
    const counts = safe.map(() => 0);
    counts[0] = total;
    return counts;
  }

  const raw = safe.map((weight) => (weight / weightTotal) * total);
  const counts = raw.map(Math.floor);
  let leftover = total - counts.reduce((sum, count) => sum + count, 0);
  const byFrac = raw
    .map((value, index) => ({
      index,
      frac: value - Math.floor(value),
      weight: safe[index],
    }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (let i = 0; leftover > 0 && byFrac.length > 0; i++) {
    counts[byFrac[i % byFrac.length].index] += 1;
    leftover -= 1;
  }
  return counts;
}

export function randomizeColors(
  blocks: MosaicBlock[],
  colors: string[],
  amounts?: number[],
  rng: Rng = Math.random,
  locked?: boolean[],
): MosaicBlock[] {
  if (colors.length === 0) return blocks;

  const lockedFlags =
    locked && locked.length === colors.length
      ? locked
      : colors.map(() => false);
  const lockedColorSet = new Set(
    colors.filter((_, index) => lockedFlags[index]),
  );
  const unlockedColors = colors.filter((_, index) => !lockedFlags[index]);
  const unlockedAmounts = (
    amounts && amounts.length === colors.length
      ? amounts
      : colors.map(() => 1)
  ).filter((_, index) => !lockedFlags[index]);

  if (unlockedColors.length === 0) return blocks;

  let unlockedCount = 0;
  for (const block of blocks) {
    if (!lockedColorSet.has(block.color)) unlockedCount += 1;
  }
  if (unlockedCount === 0) return blocks;

  const counts = weightedCounts(unlockedAmounts, unlockedCount);
  const bag: string[] = [];
  for (let c = 0; c < unlockedColors.length; c++) {
    for (let n = 0; n < counts[c]; n++) bag.push(unlockedColors[c]);
  }
  shuffleInPlace(bag, rng);

  let bagIndex = 0;
  return blocks.map((block) => {
    if (lockedColorSet.has(block.color)) return block;
    const color = bag[bagIndex] ?? unlockedColors[0];
    bagIndex += 1;
    return { ...block, color };
  });
}

export function generateRandomPalette(
  count: number,
  rng: Rng = Math.random,
): string[] {
  if (count <= 0) return ["#ffffff"];

  const colors: string[] = [];
  const hueOffset = rng() * 360;

  for (let i = 0; i < count; i++) {
    const h = (hueOffset + (360 / count) * i + rng() * 24) % 360;
    const s = 0.55 + rng() * 0.4;
    const v = 0.65 + rng() * 0.3;
    colors.push(hsvToHex(h, s, v));
  }

  return colors;
}

export function defaultMaxSpan(
  density: Density,
  orientation: Orientation,
): number {
  const { columns, rows } = getGridCounts(orientation, density);
  return Math.min(8, Math.max(columns, rows));
}
