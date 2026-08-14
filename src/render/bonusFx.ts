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
    // Independent R/G/B — colored noise (Photoshop-style), not monochrome
    data[i] = (Math.random() * 256) | 0;
    data[i + 1] = (Math.random() * 256) | 0;
    data[i + 2] = (Math.random() * 256) | 0;
    data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  grainTile = ctx.canvas;
  return grainTile;
}

/** Apply contrast, brightness + hue in one filter pass when any is non-default. */
function applyColorFilters(
  ctx: CanvasRenderingContext2D,
  contrast: number,
  brightness: number,
  hueDegrees: number,
  width: number,
  height: number,
): void {
  // sliders −100…100 → CSS factor (1 = unchanged)
  const contrastFactor = 1 + contrast / 100;
  const brightnessFactor = 1 + brightness / 100;
  if (contrastFactor === 1 && brightnessFactor === 1 && hueDegrees === 0) return;

  const parts: string[] = [];
  if (contrastFactor !== 1) parts.push(`contrast(${contrastFactor})`);
  if (brightnessFactor !== 1) parts.push(`brightness(${brightnessFactor})`);
  if (hueDegrees !== 0) parts.push(`hue-rotate(${hueDegrees}deg)`);

  const copy = context2d(width, height);
  if (!copy) return;
  try {
    copy.filter = parts.join(" ");
    copy.drawImage(ctx.canvas, 0, 0);
    copy.filter = "none";
  } catch {
    return;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(copy.canvas, 0, 0);
}

/** Full-frame difference with white — inverts opaque RGB. */
function applyInvert(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
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
  const contrast = clampInt(settings.contrast, -100, 100, 0);
  const brightness = clampInt(settings.brightness, -100, 100, 0);
  const noise = clampInt(settings.noiseAmount, 0, 100, 0);
  const invert = Boolean(settings.invert);
  if (hue === 0 && contrast === 0 && brightness === 0 && noise <= 0 && !invert)
    return;

  try {
    applyColorFilters(ctx, contrast, brightness, hue, width, height);
    applyNoise(ctx, noise, width, height);
    if (invert) applyInvert(ctx, width, height);
  } catch {
    // Color filters / noise at 4K can fail to allocate — keep the mosaic.
  }
}
