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
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    if (canvas.width !== width || canvas.height !== height) return null;
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

/** Keep padded blur buffers within common GPU texture limits. */
const MAX_FILTER_EDGE = 8192;

/**
 * CSS `blur()` on 4K canvases can kill the GPU process (uncaught).
 * Blur at 1080p, then scale back up.
 */
export const MAX_BLUR_EDGE = 1920;

/** Working bitmap for a CSS blur pass — never larger than MAX_BLUR_EDGE. */
export function gridBlurWorkingSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= MAX_BLUR_EDGE) return { width, height };
  const scale = MAX_BLUR_EDGE / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

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
  const work = gridBlurWorkingSize(width, height);
  const workW = work.width;
  const workH = work.height;
  const radiusPx = radius * (workW / width);

  let blurSource: CanvasImageSource = source;
  if (workW !== width || workH !== height) {
    const scaled = context2d(workW, workH);
    if (!scaled) return null;
    scaled.imageSmoothingEnabled = true;
    scaled.drawImage(source, 0, 0, workW, workH);
    blurSource = scaled.canvas;
  }

  const maxPad = Math.max(
    0,
    Math.min(
      Math.floor((MAX_FILTER_EDGE - workW) / 2),
      Math.floor((MAX_FILTER_EDGE - workH) / 2),
    ),
  );
  // Gaussian kernel is ~3σ; +1px so the crop stays inside opaque samples.
  const pad = Math.min(Math.ceil(radiusPx * 3) + 1, maxPad);

  const paddedW = workW + pad * 2;
  const paddedH = workH + pad * 2;
  const padded = context2d(paddedW, paddedH);
  if (!padded) return null;

  if (pad > 0) clampExtend(padded, blurSource, pad, workW, workH);
  else padded.drawImage(blurSource, 0, 0);

  const blurred = context2d(paddedW, paddedH);
  if (!blurred) return null;
  try {
    blurred.filter = `blur(${radiusPx}px)`;
    blurred.drawImage(padded.canvas, 0, 0);
    blurred.filter = "none";
  } catch {
    return null;
  }

  const out = context2d(width, height);
  if (!out) return null;
  if (workW !== width || workH !== height) {
    out.imageSmoothingEnabled = true;
  }
  out.drawImage(
    blurred.canvas,
    pad,
    pad,
    workW,
    workH,
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
  instanceSeed = 0,
): void {
  const { columns, rows, width, height } = grid;
  const t = chaos / 100;
  const rng = mulberry32(
    hashSeed(columns, rows, width, height, chaos, instanceSeed),
  );
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

/** True when grid blur will actually run (toggle on and amount > 0). */
export function isGridBlurActive(settings: FrameSettings): boolean {
  if (!settings.gridBlur) return false;
  return clampInt(settings.gridBlurAmount, 0, 100, 50) > 0;
}

export function applyGridBlur(
  ctx: CanvasRenderingContext2D,
  orientation: Orientation,
  settings: FrameSettings,
  width: number,
  height: number,
  opaqueBackdrop = true,
): void {
  if (!isGridBlurActive(settings)) return;

  try {
    const amount = clampInt(settings.gridBlurAmount, 0, 100, 50);

    const density = settings.gridBlurDensity ?? (settings.density || 1);
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

    const chaos = clampInt(settings.gridBlurChaos, 0, 100, 50);
    if (chaos > 0) {
      const work = gridBlurWorkingSize(width, height);
      const sharp = context2d(work.width, work.height);
      if (!sharp) return;
      sharp.imageSmoothingEnabled = true;
      sharp.drawImage(ctx.canvas, 0, 0, work.width, work.height);

      const workGrid = getGridDimensions(
        orientation,
        density,
        work.width,
        work.height,
      );
      const mask = context2d(work.width, work.height);
      if (!mask) return;
      drawSharpMask(mask, workGrid, chaos, settings.gridBlurSeed ?? 0);

      // Feather patch edges so restored sharp tiles don't cut hard seams
      // through an otherwise blurred field (esp. high chaos + high amount).
      // Skip on mild blur — hard mask is fine and saves a full-canvas pass.
      const scale = work.width / width;
      const feather = Math.min(
        Math.max(radius * scale * 0.12, 1.5 * scale),
        workGrid.cellSize * 0.35,
      );
      const softMask =
        radius >= 2 && chaos >= 15
          ? blurredCopy(mask.canvas, work.width, work.height, feather, false)
          : null;
      sharp.globalCompositeOperation = "destination-in";
      sharp.drawImage(softMask ?? mask.canvas, 0, 0);

      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(blurred, 0, 0);
      ctx.imageSmoothingEnabled = work.width !== width;
      ctx.drawImage(sharp.canvas, 0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      if (opaqueBackdrop) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
      return;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(blurred, 0, 0);
    ctx.imageSmoothingEnabled = true;
  } catch {
    // CSS blur on large canvases can throw or fail to allocate — keep the sharp mosaic.
  }
}
