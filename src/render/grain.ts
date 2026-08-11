import { normalizeHex } from "../colorMath";
import type { GridDimensions, MosaicBlock } from "../types";

/** 2× sampling frequency — grain specks at half the previous size. */
const GRAIN_FREQUENCY = 2;

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** Deterministic uniform noise in [-1, 1] — stable across re-renders. */
function uniformNoise(x: number, y: number): number {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 0x80000000 - 1;
}

function pixelInBlockShape(
  px: number,
  py: number,
  block: MosaicBlock,
  grid: GridDimensions,
  ringThickness: number,
): boolean {
  const x = block.col * grid.cellSize;
  const y = block.row * grid.cellSize;
  const drawW = block.width * grid.cellSize;
  const drawH = block.height * grid.cellSize;

  if (px < x || py < y || px >= x + drawW || py >= y + drawH) return false;

  if (block.shape === "block") return true;

  const diameter = Math.min(drawW, drawH);
  const cx = x + drawW / 2;
  const cy = y + drawH / 2;
  const outerR = diameter / 2;
  const dx = px + 0.5 - cx;
  const dy = py + 0.5 - cy;
  const distSq = dx * dx + dy * dy;

  if (block.shape === "sphere") {
    return distSq <= outerR * outerR;
  }

  if (outerR <= 0) return false;

  if (ringThickness <= 0) {
    return distSq <= outerR * outerR;
  }

  const holeRatio = Math.min(0.95, Math.max(0.05, ringThickness / 100));
  const innerR = outerR * holeRatio;
  const bandWidth = outerR - innerR;

  if (bandWidth < 2) {
    const strokeCenterR = outerR - bandWidth / 2;
    const strokeHalf = Math.max(0.5, bandWidth / 2);
    const inner = strokeCenterR - strokeHalf;
    const outer = strokeCenterR + strokeHalf;
    return distSq >= inner * inner && distSq <= outer * outer;
  }

  return distSq <= outerR * outerR && distSq >= innerR * innerR;
}

/**
 * Classic Photoshop-style monochromatic noise: add uniform random offsets
 * directly to each RGB channel, preserving hue while adding static grain.
 */
export function applyPhotoshopGrain(
  ctx: CanvasRenderingContext2D,
  blocks: MosaicBlock[],
  grid: GridDimensions,
  grainLookup: Map<string, number>,
  ringThickness: number,
  width: number,
  height: number,
): void {
  const hasGrain = blocks.some(
    (block) =>
      block.color &&
      (grainLookup.get(normalizeHex(block.color)) ?? 0) > 0,
  );
  if (!hasGrain) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  for (const block of blocks) {
    if (!block.color) continue;

    const grain = grainLookup.get(normalizeHex(block.color)) ?? 0;
    if (grain <= 0) continue;

    const amount = (grain / 100) * 96;
    const x0 = block.col * grid.cellSize;
    const y0 = block.row * grid.cellSize;
    const x1 = x0 + block.width * grid.cellSize;
    const y1 = y0 + block.height * grid.cellSize;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (!pixelInBlockShape(px, py, block, grid, ringThickness)) continue;

        const index = (py * width + px) * 4;
        if (data[index + 3] === 0) continue;

        const noise = uniformNoise(px * GRAIN_FREQUENCY, py * GRAIN_FREQUENCY) * amount;
        data[index] = clamp255(data[index] + noise);
        data[index + 1] = clamp255(data[index + 1] + noise);
        data[index + 2] = clamp255(data[index + 2] + noise);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
