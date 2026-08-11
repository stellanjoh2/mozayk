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

function pickDimension(
  rng: Rng,
  maxSpan: number,
  maxSize: number,
  scaleBlend: number,
  spatialBias: number,
): number {
  const hi = Math.min(maxSpan, maxSize);
  if (hi <= 1) return 1;

  const raw = rng();
  const microT = (scaleBlend - 1) / 5;
  let exponent = 0.2 + microT * 4;
  exponent *= 1.25 - spatialBias * 0.35;
  exponent = Math.max(0.15, Math.min(5, exponent));

  const u = Math.pow(raw, exponent);
  return 1 + Math.floor(u * (hi - 1));
}

function fitsSizeRange(
  width: number,
  height: number,
  min: number,
  max: number,
): boolean {
  const size = Math.max(width, height);
  return size >= min && size <= max;
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

export function patchNeedsLayoutRegen(
  patch: Partial<FrameSettings>,
): boolean {
  return LAYOUT_SETTING_KEYS.some((key) => key in patch);
}

export function generateLayout(
  orientation: Orientation,
  settings: FrameSettings,
  rng: Rng = Math.random,
): MosaicBlock[] {
  const { columns, rows } = getGridCounts(orientation, settings.density);
  const occupied = Array.from({ length: rows }, () =>
    Array<boolean>(columns).fill(false),
  );
  const blocks: MosaicBlock[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (occupied[row][col]) continue;

      const spatialBias = columnPlacementBias(col, columns, settings.weight);
      const placeChance = (settings.fillAmount / 100) * spatialBias;
      if (rng() > placeChance) continue;
      const maxW = settings.randomWidth
        ? Math.min(settings.maxWidth, columns - col)
        : 1;
      const maxH = settings.randomHeight
        ? Math.min(settings.maxHeight, rows - row)
        : 1;

      let width = 1;
      let height = 1;
      let placed = false;

      for (let attempt = 0; attempt < 16; attempt++) {
        width = settings.randomWidth
          ? pickDimension(
              rng,
              maxW,
              settings.maxCellSize,
              settings.scaleBlend,
              spatialBias,
            )
          : 1;
        height = settings.randomHeight
          ? pickDimension(
              rng,
              maxH,
              settings.maxCellSize,
              settings.scaleBlend,
              spatialBias,
            )
          : 1;

        if (
          !fitsSizeRange(
            width,
            height,
            settings.minCellSize,
            settings.maxCellSize,
          )
        ) {
          continue;
        }
        if (!canPlace(occupied, row, col, width, height, rows, columns)) {
          continue;
        }
        placed = true;
        break;
      }

      if (!placed) {
        width = 1;
        height = 1;
        if (!canPlace(occupied, row, col, 1, 1, rows, columns)) continue;
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

export function randomizeColors(
  blocks: MosaicBlock[],
  colors: string[],
  amounts?: number[],
  rng: Rng = Math.random,
): MosaicBlock[] {
  if (colors.length === 0) return blocks;
  return blocks.map((block) => ({
    ...block,
    color: pickWeightedColor(colors, amounts, rng),
  }));
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
