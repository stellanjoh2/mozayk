import { blockPixelRect, getGridDimensions } from "../grid/gridMath";
import type { FrameSettings, GridDimensions, Orientation } from "../types";

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

function growRect(
  occupied: boolean[][],
  col: number,
  row: number,
  columns: number,
  rows: number,
  targetW: number,
  targetH: number,
): { width: number; height: number } {
  let width = 1;
  while (
    width < targetW &&
    col + width < columns &&
    !occupied[row][col + width]
  ) {
    width++;
  }

  let height = 1;
  while (height < targetH && row + height < rows) {
    let clear = true;
    for (let c = 0; c < width; c++) {
      if (occupied[row + height][col + c]) {
        clear = false;
        break;
      }
    }
    if (!clear) break;
    height++;
  }

  return { width, height };
}

function context2d(
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (canvas.width !== width || canvas.height !== height) return null;
  return canvas.getContext("2d");
}

/** Keep padded blur buffers within common GPU texture limits. */
const MAX_FILTER_EDGE = 8192;

/**
 * CSS `blur()` treats pixels outside the *source* bitmap as transparent.
 * Drawing a tight image onto a padded canvas with the filter already on
 * still fades the crop to alpha 0 — visible in PNGs, hidden on a dark page.
 * Clamp-extend first, then blur the padded buffer, then crop.
 */
function clampExtend(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  pad: number,
  width: number,
  height: number,
): void {
  const x1 = pad + width;
  const y1 = pad + height;

  ctx.drawImage(source, 0, 0, 1, 1, 0, 0, pad, pad);
  ctx.drawImage(source, width - 1, 0, 1, 1, x1, 0, pad, pad);
  ctx.drawImage(source, 0, height - 1, 1, 1, 0, y1, pad, pad);
  ctx.drawImage(source, width - 1, height - 1, 1, 1, x1, y1, pad, pad);

  ctx.drawImage(source, 0, 0, width, 1, pad, 0, width, pad);
  ctx.drawImage(source, 0, height - 1, width, 1, pad, y1, width, pad);
  ctx.drawImage(source, 0, 0, 1, height, 0, pad, pad, height);
  ctx.drawImage(source, width - 1, 0, 1, height, x1, pad, pad, height);

  ctx.drawImage(source, pad, pad);
}

function blurredCopy(
  source: CanvasImageSource,
  width: number,
  height: number,
  radius: number,
  opaqueBackdrop: boolean,
): HTMLCanvasElement | null {
  const maxPad = Math.max(
    0,
    Math.min(
      Math.floor((MAX_FILTER_EDGE - width) / 2),
      Math.floor((MAX_FILTER_EDGE - height) / 2),
    ),
  );
  // Gaussian kernel is ~3σ; +1px so the crop stays inside opaque samples.
  const pad = Math.min(Math.ceil(radius * 3) + 1, maxPad);

  const paddedW = width + pad * 2;
  const paddedH = height + pad * 2;
  const padded = context2d(paddedW, paddedH);
  if (!padded) return null;

  if (pad > 0) clampExtend(padded, source, pad, width, height);
  else padded.drawImage(source, 0, 0);

  const blurred = context2d(paddedW, paddedH);
  if (!blurred) return null;
  try {
    blurred.filter = `blur(${radius}px)`;
    blurred.drawImage(padded.canvas, 0, 0);
    blurred.filter = "none";
  } catch {
    return null;
  }

  const out = context2d(width, height);
  if (!out) return null;
  out.drawImage(
    blurred.canvas,
    pad,
    pad,
    width,
    height,
    0,
    0,
    width,
    height,
  );

  if (opaqueBackdrop) {
    out.globalCompositeOperation = "destination-over";
    out.fillStyle = "#000000";
    out.fillRect(0, 0, width, height);
    out.globalCompositeOperation = "source-over";
  }

  return out.canvas;
}

/**
 * On-grid alpha mask: how much of the *sharp* original to put back.
 * 0 = keep the clean blur, 1 = fully sharp. Larger patches at low chaos.
 */
function drawSharpMask(
  ctx: CanvasRenderingContext2D,
  grid: GridDimensions,
  chaos: number,
): void {
  const { columns, rows, width, height } = grid;
  const t = chaos / 100;
  const rng = mulberry32(hashSeed(columns, rows, width, height, chaos));
  const occupied: boolean[][] = Array.from({ length: rows }, () =>
    Array<boolean>(columns).fill(false),
  );

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (occupied[row][col]) continue;

      const maxW = Math.max(1, Math.ceil((1 - t) * (columns - col)));
      const maxH = Math.max(1, Math.ceil((1 - t) * (rows - row)));
      const rectSize = growRect(
        occupied,
        col,
        row,
        columns,
        rows,
        1 + Math.floor(rng() * maxW),
        1 + Math.floor(rng() * maxH),
      );

      for (let r = row; r < row + rectSize.height; r++) {
        for (let c = col; c < col + rectSize.width; c++) {
          occupied[r][c] = true;
        }
      }

      const sharp = t * rng();
      if (sharp <= 0) continue;

      const rect = blockPixelRect(grid, {
        col,
        row,
        width: rectSize.width,
        height: rectSize.height,
      });
      ctx.fillStyle = `rgba(255,255,255,${sharp})`;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}

export function applyGridBlur(
  ctx: CanvasRenderingContext2D,
  orientation: Orientation,
  settings: FrameSettings,
  width: number,
  height: number,
  opaqueBackdrop = true,
): void {
  if (!settings.gridBlur) return;

  try {
    const amount = clampInt(settings.gridBlurAmount, 0, 100, 50);
    if (amount <= 0) return;

    const density = settings.gridBlurDensity ?? settings.density;
    const grid = getGridDimensions(orientation, density, width, height);
    const radius = (amount / 100) * grid.cellSize;
    if (radius < 0.25) return;

    const blurred = blurredCopy(
      ctx.canvas,
      width,
      height,
      radius,
      opaqueBackdrop,
    );
    if (!blurred) return;

    const chaos = clampInt(settings.gridBlurChaos, 0, 100, 0);
    if (chaos > 0) {
      const sharp = context2d(width, height);
      if (!sharp) return;
      sharp.drawImage(ctx.canvas, 0, 0);

      const mask = context2d(width, height);
      if (!mask) return;
      drawSharpMask(mask, grid, chaos);
      sharp.globalCompositeOperation = "destination-in";
      sharp.drawImage(mask.canvas, 0, 0);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(blurred, 0, 0);
      ctx.drawImage(sharp.canvas, 0, 0);
      if (opaqueBackdrop) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(blurred, 0, 0);
  } catch {
    // CSS blur on large canvases can throw or fail to allocate — keep the sharp mosaic.
  }
}
