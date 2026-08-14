import { normalizeHex } from "../colorMath";
import { getGridDimensions, gridEdge } from "../grid/gridMath";
import type { FrameSettings, GridDimensions, Orientation } from "../types";

const PAD_X = 2;
const PAD_Y = 2;
/** Base 5×7 glyphs — size slider scales each pixel. ~8pt at scale 1. */
const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPH_GAP = 1;

/** Column strip spacing — sparse vertical lanes. */
const COL_STRIDE = 4;
/** Row spacing within a strip — combined with COL_STRIDE → ~1/16 of cells. */
const ROW_STRIDE = 4;

export const DATA_FIELDS_SIZE_MIN = 1;
export const DATA_FIELDS_SIZE_MAX = 8;
export const DATA_FIELDS_SIZE_DEFAULT = 1;
export const DATA_FIELDS_COLOR_DEFAULT = "#ffffff";
export const DATA_FIELDS_SPAWN_DEFAULT = 50;

/**
 * 5×7 bitmaps for digits / separator — filled rects, no canvas text AA.
 * Rows are MSB = left.
 */
const GLYPHS: Record<string, readonly number[]> = {
  "0": [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
};

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

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function resolveDataFieldsSize(value: unknown): number {
  return clampInt(
    value,
    DATA_FIELDS_SIZE_MIN,
    DATA_FIELDS_SIZE_MAX,
    DATA_FIELDS_SIZE_DEFAULT,
  );
}

function glyphAdvance(scale: number): number {
  return (GLYPH_W + GLYPH_GAP) * scale;
}

function glyphWidth(label: string, scale: number): number {
  if (label.length === 0) return 0;
  return (
    label.length * GLYPH_W * scale + (label.length - 1) * GLYPH_GAP * scale
  );
}

/** Draw one glyph with fillRect — crisp pixels, no text rasterizer. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  ch: string,
  originX: number,
  originY: number,
  scale: number,
): void {
  const rows = GLYPHS[ch];
  if (!rows) return;
  for (let row = 0; row < GLYPH_H; row++) {
    const bits = rows[row];
    for (let col = 0; col < GLYPH_W; col++) {
      if ((bits >> (GLYPH_W - 1 - col)) & 1) {
        ctx.fillRect(
          originX + col * scale,
          originY + row * scale,
          scale,
          scale,
        );
      }
    }
  }
}

/**
 * Right-to-left: rightmost character sits nearest the left pad, string grows
 * into the cell. Visual order is reversed vs logical "col,row".
 */
function drawLabelRtl(
  ctx: CanvasRenderingContext2D,
  label: string,
  cellLeft: number,
  cellTop: number,
  scale: number,
): void {
  const totalW = glyphWidth(label, scale);
  let x = cellLeft + PAD_X + totalW - GLYPH_W * scale;
  const y = cellTop + PAD_Y;
  const step = glyphAdvance(scale);
  for (let i = 0; i < label.length; i++) {
    drawGlyph(ctx, label[i], Math.round(x), Math.round(y), scale);
    x -= step;
  }
}

function cellLabel(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Vertical strips: sparse columns, then every ROW_STRIDE rows (phase per
 * column so lanes don't form a horizontal grid). Density ≈ 1/16.
 */
function isCandidate(col: number, row: number): boolean {
  if (hashSeed(col, 0xdf01) % COL_STRIDE !== 0) return false;
  const phase = hashSeed(col, 0xdf02) % ROW_STRIDE;
  return row % ROW_STRIDE === phase;
}

export function drawDataFields(
  ctx: CanvasRenderingContext2D,
  orientation: Orientation,
  settings: FrameSettings,
  width: number,
  height: number,
): void {
  if (!settings.dataFields) return;

  const spawnRate = clampInt(
    settings.dataFieldsSpawnRate,
    0,
    100,
    DATA_FIELDS_SPAWN_DEFAULT,
  );
  if (spawnRate <= 0) return;

  const scale = resolveDataFieldsSize(settings.dataFieldsSize);
  const color = normalizeHex(
    settings.dataFieldsColor,
    DATA_FIELDS_COLOR_DEFAULT,
  );

  let grid: GridDimensions;
  try {
    grid = getGridDimensions(orientation, settings.density, width, height);
  } catch {
    return;
  }

  const { columns, rows, cellSize } = grid;
  if (cellSize < GLYPH_H * scale + PAD_Y * 2) return;

  const rng = mulberry32(
    hashSeed(columns, rows, width, height, spawnRate, 0xdf91),
  );
  const spawnChance = spawnRate / 100;

  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (!isCandidate(col, row)) continue;
      if (rng() >= spawnChance) continue;

      const x = gridEdge(col, columns, width);
      const y = gridEdge(row, rows, height);
      drawLabelRtl(ctx, cellLabel(col, row), x, y, scale);
    }
  }

  ctx.restore();
}
