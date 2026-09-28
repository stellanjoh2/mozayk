import { blockPixelRect, gridEdge, type PixelRect } from "../grid/gridMath";
import type { GridDimensions, MosaicBlock } from "../types";

/**
 * "New canvas" construction — a grid sweep followed by blocks lighting up.
 * The overlay sits on top of the finished mosaic and hides it behind a veil in
 * the canvas background colour; each block is punched out of that veil, so the
 * real shapes and colours are revealed instead of being redrawn here.
 */
/**
 * Act one: the outgoing mosaic is swept away left to right. Act two starts on
 * a bare canvas — laser, grid, then blocks — and runs the full three seconds.
 */
const WIPE_END_MS = 640;
const BUILD_START_MS = 640;
export const NEW_CANVAS_SEQUENCE_MS = BUILD_START_MS + 3000;

/** When the vertical laser wall begins its left-to-right sweep. */
export const SWEEP_START_MS = BUILD_START_MS + 90;
const SWEEP_END_MS = BUILD_START_MS + 1380;
/** Leading edge glow reach, in grid cells. */
const SWEEP_TRAIL_CELLS = 31.5;
const GRID_LINE_BASE_ALPHA = 0.16;
const GRID_LINE_PEAK_ALPHA = 0.9;
const GRID_FADE_START_MS = BUILD_START_MS + 2220;
const GRID_FADE_END_MS = BUILD_START_MS + 2820;

const BLOCK_WAVE_START_MS = BUILD_START_MS + 800;
/** Spread of block start times across the canvas width. */
const BLOCK_WAVE_SPAN_MS = 840;
const BLOCK_WAVE_JITTER_MS = 135;
const BLOCK_REVEAL_MS = 360;
/** Laser wash starts dying the moment it enters, then gone while blocks fill. */
const BEAM_FADE_START_MS = SWEEP_START_MS;
const BEAM_FADE_END_MS =
  BLOCK_WAVE_START_MS + BLOCK_WAVE_SPAN_MS + BLOCK_REVEAL_MS;
/** How long a block holds the accent before crossfading to its own colour. */
const ACCENT_SETTLE_MS = 520;
/** Chrome bloom around a landing block — dies fast so only the wave front glows. */
const GLOW_TAIL_MS = 200;

/**
 * Image-import fill: same block wave, timed from t=0, covering with a snapshot
 * of the outgoing mosaic instead of a solid veil / laser construction.
 */
export const IMAGE_FILL_WAVE_START_MS = 0;
export const IMAGE_FILL_SEQUENCE_MS = 1500;
/** Radial travel time — leftover after jitter + per-block iris. */
const IMAGE_FILL_WAVE_SPAN_MS =
  IMAGE_FILL_SEQUENCE_MS -
  IMAGE_FILL_WAVE_START_MS -
  BLOCK_WAVE_JITTER_MS -
  BLOCK_REVEAL_MS;
const GLOW_PEAK_ALPHA = 0.9;
const GLOW_BLUR_CSS_PX = 16;
/** Bloom is drawn at 1/4 res, blurred once, then scaled up. */
const GLOW_DOWNSCALE = 4;

let glowScratch: HTMLCanvasElement | null = null;
let glowBlurred: HTMLCanvasElement | null = null;

function acquireScratch(
  like: HTMLCanvasElement,
  width: number,
  height: number,
  slot: "src" | "blur",
): HTMLCanvasElement {
  const current = slot === "src" ? glowScratch : glowBlurred;
  if (current && current.width === width && current.height === height) {
    return current;
  }
  const canvas = current ?? makeLikeCanvas(like);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  if (slot === "src") glowScratch = canvas;
  else glowBlurred = canvas;
  return canvas;
}

function makeLikeCanvas(like: HTMLCanvasElement): HTMLCanvasElement {
  const Ctor = like.constructor as new () => HTMLCanvasElement;
  try {
    return new Ctor();
  } catch {
    return document.createElement("canvas");
  }
}

function blockGlowAmount(elapsedMs: number, startMs: number): number {
  const endMs = startMs + BLOCK_REVEAL_MS;
  if (elapsedMs < startMs || elapsedMs > endMs + GLOW_TAIL_MS) return 0;
  const attack = easeOutCubic(span(elapsedMs, startMs, endMs));
  const decay = 1 - span(elapsedMs, endMs, endMs + GLOW_TAIL_MS);
  return GLOW_PEAK_ALPHA * attack * decay * decay;
}

/** Distance behind the wipe over which an old cell fades out, in cells. */
const DISSOLVE_TRAIL_CELLS = 4;
/** Per-cell spread on that fade — neighbours dim at visibly different rates. */
const DISSOLVE_TRAIL_MIN = 0.5;
const DISSOLVE_TRAIL_MAX = 1.7;
/** How far a cell may lag the front, in cells. */
const DISSOLVE_JITTER_CELLS = 10;
/** Skews the lag low, so most cells go with the front and a few hang back. */
const DISSOLVE_JITTER_BIAS = 1.7;

const VEIL_FADE_START_MS = BUILD_START_MS + 2610;
const VEIL_FADE_END_MS = NEW_CANVAS_SEQUENCE_MS;

const GRID_STROKE_CSS_PX = 1;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u ** 3 : 1 - (2 - 2 * u) ** 3 / 2;
}

/** Fast launch, soft dock — laser wall only. */
function easeOutQuint(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u ** 5;
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

/** Second, independent jitter — lag and fade rate must not correlate. */
function cellNoiseAlt(col: number, row: number): number {
  const n = Math.sin(col * 269.5 + row * 183.3) * 24634.6345;
  return n - Math.floor(n);
}

/** Leading edge of the grid sweep, in canvas pixels. -1 before it starts. */
export function sweepEdgeX(elapsedMs: number, width: number): number {
  if (elapsedMs < SWEEP_START_MS) return -1;
  return easeOutQuint(span(elapsedMs, SWEEP_START_MS, SWEEP_END_MS)) * width;
}

/**
 * Front of the wipe that clears the outgoing mosaic. Runs the same direction
 * as the laser but on its own clock, and overshoots so nothing is left behind.
 */
export function wipeEdgeX(
  elapsedMs: number,
  width: number,
  reach: number,
): number {
  return easeInOutCubic(span(elapsedMs, 0, WIPE_END_MS)) * (width + reach);
}

/** Grid lines settle to a faint lattice, then fade out under the mosaic. */
export function gridFadeAlpha(elapsedMs: number): number {
  return 1 - span(elapsedMs, GRID_FADE_START_MS, GRID_FADE_END_MS);
}

/** Laser wall wash — brightest on entry, fading through the sweep and after. */
export function beamFadeAlpha(elapsedMs: number): number {
  if (elapsedMs < BEAM_FADE_START_MS) return 1;
  return 1 - span(elapsedMs, BEAM_FADE_START_MS, BEAM_FADE_END_MS);
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
  waveStartMs: number = BLOCK_WAVE_START_MS,
): BlockCue[] {
  if (grid.width <= 0) return [];
  return blocks.map((block) => {
    const rect = blockPixelRect(grid, block);
    const centerFrac = clamp01((rect.x + rect.width / 2) / grid.width);
    return {
      rect,
      startMs:
        waveStartMs +
        centerFrac * BLOCK_WAVE_SPAN_MS +
        cellNoise(block.col, block.row) * BLOCK_WAVE_JITTER_MS,
    };
  });
}

/**
 * Image-fill cues — blocks punch in by distance from the canvas centre,
 * so the reveal expands as a radial wave.
 */
export function buildRadialFillBlockCues(
  blocks: readonly MosaicBlock[],
  grid: GridDimensions,
): BlockCue[] {
  if (grid.width <= 0 || grid.height <= 0) return [];
  const cx = grid.width / 2;
  const cy = grid.height / 2;
  const maxDist = Math.hypot(cx, cy);
  return blocks.map((block) => {
    const rect = blockPixelRect(grid, block);
    const bx = rect.x + rect.width / 2;
    const by = rect.y + rect.height / 2;
    const radiusFrac =
      maxDist > 0 ? clamp01(Math.hypot(bx - cx, by - cy) / maxDist) : 0;
    return {
      rect,
      startMs:
        IMAGE_FILL_WAVE_START_MS +
        radiusFrac * IMAGE_FILL_WAVE_SPAN_MS +
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
  latticeFade: number,
  beamFade: number,
  lineWidth: number,
): void {
  const trail = Math.max(1, grid.cellSize * SWEEP_TRAIL_CELLS);
  const headAlpha = GRID_LINE_PEAK_ALPHA * beamFade * latticeFade;

  ctx.save();
  ctx.lineWidth = lineWidth;

  // Verticals brighten as the edge passes them, then cool to the base lattice.
  for (let c = 1; c < grid.columns; c++) {
    const x = gridEdge(c, grid.columns, grid.width);
    if (x > edgeX) break;
    const heat = Math.exp(-(edgeX - x) / trail) * beamFade;
    const alpha =
      (GRID_LINE_BASE_ALPHA +
        (GRID_LINE_PEAK_ALPHA - GRID_LINE_BASE_ALPHA) * heat) *
      latticeFade;
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
  ctx.strokeStyle = rgba(accent, GRID_LINE_BASE_ALPHA * latticeFade);
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
  wash.addColorStop(1, rgba(accent, 0.28 * fade));
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

/** How far past the right edge the sweep must be for the old canvas to be gone. */
function dissolveReach(grid: GridDimensions): number {
  return (
    grid.cellSize *
    (DISSOLVE_TRAIL_CELLS * DISSOLVE_TRAIL_MAX + DISSOLVE_JITTER_CELLS)
  );
}

/**
 * Paints the outgoing mosaic and erases it cell by cell as the sweep passes,
 * so the previous canvas shatters instead of blinking out on frame one.
 */
function drawDissolvingCanvas(
  ctx: CanvasRenderingContext2D,
  grid: GridDimensions,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  edgeX: number,
): void {
  const fit = Math.min(grid.width / imageWidth, grid.height / imageHeight);
  const drawWidth = imageWidth * fit;
  const drawHeight = imageHeight * fit;
  ctx.drawImage(
    image,
    (grid.width - drawWidth) / 2,
    (grid.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );

  if (edgeX < 0) return;

  const trail = Math.max(1, grid.cellSize * DISSOLVE_TRAIL_CELLS);
  const jitterMax = grid.cellSize * DISSOLVE_JITTER_CELLS;
  const clearedTo = edgeX - trail * DISSOLVE_TRAIL_MAX - jitterMax;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";

  if (clearedTo > 0) {
    ctx.fillRect(0, 0, clearedTo, grid.height);
  }

  // Only the band still fading needs per-cell work; everything behind it is gone.
  const first = Math.max(
    0,
    Math.floor((clearedTo / grid.width) * grid.columns),
  );
  const last = Math.min(
    grid.columns - 1,
    Math.floor((edgeX / grid.width) * grid.columns),
  );
  for (let c = first; c <= last; c++) {
    const x = gridEdge(c, grid.columns, grid.width);
    const x2 = gridEdge(c + 1, grid.columns, grid.width);
    for (let r = 0; r < grid.rows; r++) {
      const lag = cellNoise(c, r) ** DISSOLVE_JITTER_BIAS * jitterMax;
      const fade =
        trail *
        (DISSOLVE_TRAIL_MIN +
          cellNoiseAlt(c, r) * (DISSOLVE_TRAIL_MAX - DISSOLVE_TRAIL_MIN));
      const alpha = clamp01((edgeX - x2 - lag) / fade);
      if (alpha <= 0.002) continue;
      const y = gridEdge(r, grid.rows, grid.height);
      const y2 = gridEdge(r + 1, grid.rows, grid.height);
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, x2 - x, y2 - y);
    }
  }
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
  /** Snapshot of the outgoing mosaic, dissolved behind the sweep. */
  wipeImage?: CanvasImageSource | null;
  wipeImageWidth?: number;
  wipeImageHeight?: number;
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
  const edgeX = sweepEdgeX(elapsedMs, grid.width);
  const latticeFade = gridFadeAlpha(elapsedMs);
  const beamFade = beamFadeAlpha(elapsedMs);
  const veil = veilAlpha(elapsedMs);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, grid.width, grid.height);

  const { wipeImage, wipeImageWidth = 0, wipeImageHeight = 0 } = options;
  if (
    wipeImage &&
    wipeImageWidth > 0 &&
    wipeImageHeight > 0 &&
    elapsedMs < WIPE_END_MS
  ) {
    drawDissolvingCanvas(
      ctx,
      grid,
      wipeImage,
      wipeImageWidth,
      wipeImageHeight,
      wipeEdgeX(elapsedMs, grid.width, dissolveReach(grid)),
    );
  }

  // Behind the old canvas rather than over it — the veil fills what dissolved.
  if (veil > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.globalAlpha = veil;
    ctx.fillStyle = veilColor;
    ctx.fillRect(0, 0, grid.width, grid.height);
    ctx.restore();
  }

  if (edgeX >= 0 && latticeFade > 0) {
    drawGridLines(
      ctx,
      grid,
      accent,
      edgeX,
      latticeFade,
      beamFade,
      gridStroke,
    );
  }

  punchCover(ctx, cues, elapsedMs);
  // Accent flash while the veil is still open — after destination-out resets.
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
  if (edgeX >= 0 && beamFade > 0) {
    drawSweepBeam(ctx, grid, accent, edgeX, beamFade, gridStroke);
  }
  drawLandingGlow(canvas, ctx, cues, elapsedMs, accent, displayScale);
}

export type ImageFillFrameOptions = {
  grid: GridDimensions;
  cues: readonly BlockCue[];
  elapsedMs: number;
  /** Snapshot of the mosaic before the import landed. */
  coverImage: CanvasImageSource;
  coverImageWidth: number;
  coverImageHeight: number;
};

/**
 * Image-import fill — cover with the outgoing mosaic, then punch it away so
 * the imported colours show through. No accent flash or glow.
 */
export function drawImageFillFrame(
  canvas: HTMLCanvasElement,
  options: ImageFillFrameOptions,
): void {
  const { grid, cues, elapsedMs } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, grid.width, grid.height);

  const { coverImage, coverImageWidth, coverImageHeight } = options;
  if (coverImageWidth > 0 && coverImageHeight > 0) {
    const fit = Math.min(
      grid.width / coverImageWidth,
      grid.height / coverImageHeight,
    );
    const drawWidth = coverImageWidth * fit;
    const drawHeight = coverImageHeight * fit;
    ctx.drawImage(
      coverImage,
      (grid.width - drawWidth) / 2,
      (grid.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  }

  punchCoverFill(ctx, cues, elapsedMs);
}

/** Punch completed / iris-ing blocks out of the cover (new-canvas veil). */
function punchCover(
  ctx: CanvasRenderingContext2D,
  cues: readonly BlockCue[],
  elapsedMs: number,
): void {
  punchCoverWithEase(ctx, cues, elapsedMs, easeOutCubic, 0.2);
}

/** Image-fill punch — ease-out only, iris from zero (no soft lead-in). */
function punchCoverFill(
  ctx: CanvasRenderingContext2D,
  cues: readonly BlockCue[],
  elapsedMs: number,
): void {
  punchCoverWithEase(ctx, cues, elapsedMs, easeOutQuint, 0);
}

function punchCoverWithEase(
  ctx: CanvasRenderingContext2D,
  cues: readonly BlockCue[],
  elapsedMs: number,
  ease: (t: number) => number,
  startScale: number,
): void {
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  for (const cue of cues) {
    if (elapsedMs < cue.startMs + BLOCK_REVEAL_MS) continue;
    const { x, y, width, height } = cue.rect;
    ctx.rect(x, y, width, height);
  }
  ctx.fill();

  const scaleSpan = 1 - startScale;
  for (const cue of cues) {
    const reveal = span(elapsedMs, cue.startMs, cue.startMs + BLOCK_REVEAL_MS);
    if (reveal <= 0 || reveal >= 1) continue;
    const eased = ease(reveal);
    const iris = centeredRect(cue.rect, startScale + scaleSpan * eased);
    ctx.globalAlpha = Math.min(1, eased * 1.4);
    ctx.fillRect(iris.x, iris.y, iris.width, iris.height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/**
 * One downscaled blur for the whole wave front — per-block shadowBlur
 * gaussian-blurred the overlay dozens of times per frame.
 */
function drawLandingGlow(
  source: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cues: readonly BlockCue[],
  elapsedMs: number,
  accent: Rgb,
  displayScale: number,
): void {
  const scale = 1 / GLOW_DOWNSCALE;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const scratch = acquireScratch(source, w, h, "src");
  const gtx = scratch.getContext("2d");
  if (!gtx) return;

  gtx.setTransform(1, 0, 0, 1, 0, 0);
  gtx.clearRect(0, 0, w, h);

  let lit = 0;
  for (const cue of cues) {
    const glow = blockGlowAmount(elapsedMs, cue.startMs);
    if (glow <= 0.002) continue;
    lit += 1;
    const reveal = span(
      elapsedMs,
      cue.startMs,
      cue.startMs + BLOCK_REVEAL_MS,
    );
    const rect =
      reveal < 1
        ? centeredRect(cue.rect, 0.2 + 0.8 * easeOutCubic(reveal))
        : cue.rect;
    gtx.fillStyle = rgba(accent, glow);
    gtx.fillRect(
      rect.x * scale,
      rect.y * scale,
      rect.width * scale,
      rect.height * scale,
    );
  }
  if (lit === 0) return;

  const blurPx = Math.max(1, (GLOW_BLUR_CSS_PX * displayScale) / GLOW_DOWNSCALE);
  const blurred = acquireScratch(source, w, h, "blur");
  const btx = blurred.getContext("2d");
  if (!btx) return;
  btx.setTransform(1, 0, 0, 1, 0, 0);
  btx.clearRect(0, 0, w, h);
  try {
    btx.filter = `blur(${blurPx}px)`;
    btx.drawImage(scratch, 0, 0);
    btx.filter = "none";
  } catch {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(blurred, 0, 0, source.width, source.height);
  ctx.restore();
}
