import { blockPixelRect, gridEdge, type PixelRect } from "../grid/gridMath";
import type { GridDimensions, MosaicBlock } from "../types";

/**
 * "New canvas" construction — a grid sweep followed by blocks lighting up.
 * The overlay sits on top of the finished mosaic and hides it behind a veil in
 * the canvas background colour; each block is punched out of that veil, so the
 * real shapes and colours are revealed instead of being redrawn here.
 */
export const NEW_CANVAS_SEQUENCE_MS = 3000;

const SWEEP_START_MS = 90;
const SWEEP_END_MS = 1380;
/** Leading edge glow reach, in grid cells. */
const SWEEP_TRAIL_CELLS = 5.25;
const GRID_LINE_BASE_ALPHA = 0.16;
const GRID_LINE_PEAK_ALPHA = 0.9;
const GRID_FADE_START_MS = 2220;
const GRID_FADE_END_MS = 2820;

const BLOCK_WAVE_START_MS = 1050;
/** Spread of block start times across the canvas width. */
const BLOCK_WAVE_SPAN_MS = 840;
const BLOCK_WAVE_JITTER_MS = 135;
const BLOCK_REVEAL_MS = 360;
const OUTLINE_LEAD_MS = 225;
const OUTLINE_TAIL_MS = 420;
const OUTLINE_ALPHA = 0.85;
/** How long a block holds the accent before crossfading to its own colour. */
const ACCENT_SETTLE_MS = 520;

const VEIL_FADE_START_MS = 2610;
const VEIL_FADE_END_MS = NEW_CANVAS_SEQUENCE_MS;

const GRID_STROKE_CSS_PX = 1;
const OUTLINE_STROKE_CSS_PX = 2;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeInOutQuint(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 16 * u ** 5 : 1 - (2 - 2 * u) ** 5 / 2;
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function span(value: number, from: number, to: number): number {
  if (to <= from) return value >= to ? 1 : 0;
  return clamp01((value - from) / (to - from));
}

/** Deterministic 0–1 jitter so the wave front is ragged, not a ruler edge. */
function cellNoise(col: number, row: number): number {
  const n = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Leading edge of the grid sweep, in canvas pixels. -1 before it starts. */
export function sweepEdgeX(elapsedMs: number, width: number): number {
  if (elapsedMs < SWEEP_START_MS) return -1;
  return easeInOutQuint(span(elapsedMs, SWEEP_START_MS, SWEEP_END_MS)) * width;
}

/** Grid lines settle to a faint lattice, then fade out under the mosaic. */
export function gridFadeAlpha(elapsedMs: number): number {
  return 1 - span(elapsedMs, GRID_FADE_START_MS, GRID_FADE_END_MS);
}

export function veilAlpha(elapsedMs: number): number {
  return 1 - span(elapsedMs, VEIL_FADE_START_MS, VEIL_FADE_END_MS);
}

export type BlockCue = {
  rect: PixelRect;
  startMs: number;
};

/** Blocks light up in a wave that trails the sweep, west to east. */
export function buildBlockCues(
  blocks: readonly MosaicBlock[],
  grid: GridDimensions,
): BlockCue[] {
  if (grid.width <= 0) return [];
  return blocks.map((block) => {
    const rect = blockPixelRect(grid, block);
    const centerFrac = clamp01((rect.x + rect.width / 2) / grid.width);
    return {
      rect,
      startMs:
        BLOCK_WAVE_START_MS +
        centerFrac * BLOCK_WAVE_SPAN_MS +
        cellNoise(block.col, block.row) * BLOCK_WAVE_JITTER_MS,
    };
  });
}

type Rgb = [number, number, number];

/** Parse the computed `rgb()` / `rgba()` string a CSS variable resolves to. */
export function parseRgb(color: string, fallback: Rgb = [255, 83, 0]): Rgb {
  const match = color.match(/-?\d+(\.\d+)?/g);
  if (!match || match.length < 3) return fallback;
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function centeredRect(rect: PixelRect, scale: number): PixelRect {
  const width = rect.width * scale;
  const height = rect.height * scale;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  grid: GridDimensions,
  accent: Rgb,
  edgeX: number,
  fade: number,
  lineWidth: number,
): void {
  const trail = Math.max(1, grid.cellSize * SWEEP_TRAIL_CELLS);
  const headAlpha = GRID_LINE_PEAK_ALPHA * fade;

  ctx.save();
  ctx.lineWidth = lineWidth;

  // Verticals brighten as the edge passes them, then cool to the base lattice.
  for (let c = 1; c < grid.columns; c++) {
    const x = gridEdge(c, grid.columns, grid.width);
    if (x > edgeX) break;
    const heat = Math.exp(-(edgeX - x) / trail);
    const alpha =
      (GRID_LINE_BASE_ALPHA +
        (GRID_LINE_PEAK_ALPHA - GRID_LINE_BASE_ALPHA) * heat) *
      fade;
    if (alpha <= 0.002) continue;
    ctx.strokeStyle = rgba(accent, alpha);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, grid.height);
    ctx.stroke();
  }

  // Horizontals extend behind the edge — one flat pass, one gradient head.
  ctx.beginPath();
  for (let r = 1; r < grid.rows; r++) {
    const y = gridEdge(r, grid.rows, grid.height);
    ctx.moveTo(0, y);
    ctx.lineTo(edgeX, y);
  }
  ctx.strokeStyle = rgba(accent, GRID_LINE_BASE_ALPHA * fade);
  ctx.stroke();

  if (edgeX > 0 && headAlpha > 0.002) {
    const gradient = ctx.createLinearGradient(edgeX - trail, 0, edgeX, 0);
    gradient.addColorStop(0, rgba(accent, 0));
    gradient.addColorStop(1, rgba(accent, headAlpha));
    ctx.strokeStyle = gradient;
    ctx.stroke();
  }

  ctx.restore();
}

function drawSweepBeam(
  ctx: CanvasRenderingContext2D,
  grid: GridDimensions,
  accent: Rgb,
  edgeX: number,
  fade: number,
  lineWidth: number,
): void {
  const trail = Math.max(1, grid.cellSize * SWEEP_TRAIL_CELLS);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const wash = ctx.createLinearGradient(edgeX - trail, 0, edgeX, 0);
  wash.addColorStop(0, rgba(accent, 0));
  wash.addColorStop(1, rgba(accent, 0.18 * fade));
  ctx.fillStyle = wash;
  ctx.fillRect(edgeX - trail, 0, trail, grid.height);

  ctx.strokeStyle = rgba(accent, 0.95 * fade);
  ctx.lineWidth = lineWidth * 2;
  ctx.beginPath();
  ctx.moveTo(edgeX, 0);
  ctx.lineTo(edgeX, grid.height);
  ctx.stroke();
  ctx.restore();
}

export type NewCanvasFrameOptions = {
  grid: GridDimensions;
  cues: readonly BlockCue[];
  elapsedMs: number;
  /** Opaque colour of the canvas background — the veil must match it. */
  veilColor: string;
  /** Computed chrome accent, e.g. "rgb(255, 83, 0)". */
  accentColor: string;
  /** Canvas backing pixels per CSS pixel — keeps strokes at screen weight. */
  displayScale: number;
};

export function drawNewCanvasFrame(
  canvas: HTMLCanvasElement,
  options: NewCanvasFrameOptions,
): void {
  const { grid, cues, elapsedMs, veilColor, displayScale } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const accent = parseRgb(options.accentColor);
  const gridStroke = GRID_STROKE_CSS_PX * displayScale;
  const outlineStroke = OUTLINE_STROKE_CSS_PX * displayScale;
  const edgeX = sweepEdgeX(elapsedMs, grid.width);
  const fade = gridFadeAlpha(elapsedMs);
  const veil = veilAlpha(elapsedMs);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, grid.width, grid.height);

  if (veil > 0) {
    ctx.globalAlpha = veil;
    ctx.fillStyle = veilColor;
    ctx.fillRect(0, 0, grid.width, grid.height);
    ctx.globalAlpha = 1;
  }

  if (edgeX >= 0 && fade > 0) {
    drawGridLines(ctx, grid, accent, edgeX, fade, gridStroke);
  }

  // Punch the veil (and the grid drawn onto it) so the mosaic shows through.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  for (const cue of cues) {
    if (elapsedMs < cue.startMs + BLOCK_REVEAL_MS) continue;
    const { x, y, width, height } = cue.rect;
    ctx.rect(x, y, width, height);
  }
  ctx.fill();

  for (const cue of cues) {
    const reveal = span(elapsedMs, cue.startMs, cue.startMs + BLOCK_REVEAL_MS);
    if (reveal <= 0 || reveal >= 1) continue;
    const eased = easeOutCubic(reveal);
    const iris = centeredRect(cue.rect, 0.2 + 0.8 * eased);
    ctx.globalAlpha = Math.min(1, eased * 1.4);
    ctx.fillRect(iris.x, iris.y, iris.width, iris.height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // Each block lands in the theme accent, then crossfades to its own colour.
  for (const cue of cues) {
    const endMs = cue.startMs + BLOCK_REVEAL_MS;
    if (elapsedMs < cue.startMs || elapsedMs > endMs + ACCENT_SETTLE_MS) {
      continue;
    }
    const held = 1 - span(elapsedMs, endMs, endMs + ACCENT_SETTLE_MS);
    const alpha = held * held * (3 - 2 * held);
    if (alpha <= 0.002) continue;
    const reveal = span(elapsedMs, cue.startMs, endMs);
    const rect =
      reveal < 1
        ? centeredRect(cue.rect, 0.2 + 0.8 * easeOutCubic(reveal))
        : cue.rect;
    ctx.fillStyle = rgba(accent, alpha);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  if (edgeX >= 0 && edgeX <= grid.width && fade > 0) {
    drawSweepBeam(ctx, grid, accent, edgeX, fade, gridStroke);
  }

  // Wireframe box draws ahead of the block and burns off once it has landed.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = outlineStroke;
  for (const cue of cues) {
    const endMs = cue.startMs + BLOCK_REVEAL_MS;
    if (elapsedMs < cue.startMs - OUTLINE_LEAD_MS) continue;
    if (elapsedMs > endMs + OUTLINE_TAIL_MS) continue;

    const lead = span(elapsedMs, cue.startMs - OUTLINE_LEAD_MS, cue.startMs);
    const tail = 1 - span(elapsedMs, endMs, endMs + OUTLINE_TAIL_MS);
    const outline = OUTLINE_ALPHA * lead * tail;
    if (outline <= 0.002) continue;
    ctx.strokeStyle = rgba(accent, outline);
    ctx.strokeRect(cue.rect.x, cue.rect.y, cue.rect.width, cue.rect.height);
  }
  ctx.restore();
}
