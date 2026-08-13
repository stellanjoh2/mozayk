import type { FrameSettings } from "../types";

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

const GRAIN_TILE = 256;
let grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;

  const ctx = context2d(GRAIN_TILE, GRAIN_TILE);
  if (!ctx) {
    grainTile = document.createElement("canvas");
    return grainTile;
  }

  const pixels = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = (Math.random() * 256) | 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  grainTile = ctx.canvas;
  return grainTile;
}

function applyHue(
  ctx: CanvasRenderingContext2D,
  degrees: number,
  width: number,
  height: number,
): void {
  if (degrees === 0) return;

  const copy = context2d(width, height);
  if (!copy) return;
  try {
    copy.filter = `hue-rotate(${degrees}deg)`;
    copy.drawImage(ctx.canvas, 0, 0);
    copy.filter = "none";
  } catch {
    return;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(copy.canvas, 0, 0);
}

function applyNoise(
  ctx: CanvasRenderingContext2D,
  amount: number,
  width: number,
  height: number,
): void {
  if (amount <= 0) return;

  const pattern = ctx.createPattern(getGrainTile(), "repeat");
  if (!pattern) return;

  ctx.save();
  ctx.globalAlpha = (amount / 100) * 0.4;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function applyBonusFx(
  ctx: CanvasRenderingContext2D,
  settings: FrameSettings,
  width: number,
  height: number,
): void {
  const hue = clampInt(settings.hueShift, -180, 180, 0);
  const noise = clampInt(settings.noiseAmount, 0, 100, 0);
  if (hue === 0 && noise <= 0) return;

  try {
    applyHue(ctx, hue, width, height);
    applyNoise(ctx, noise, width, height);
  } catch {
    // Hue/noise at 4K can fail to allocate a filter buffer — keep the mosaic.
  }
}
