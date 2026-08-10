import { getGridDimensions } from "../grid/gridMath";
import type {
  FrameSettings,
  GridDimensions,
  MosaicBlock,
  Orientation,
} from "../types";

export type RenderOptions = {
  orientation: Orientation;
  settings: FrameSettings;
  blocks: MosaicBlock[];
  width: number;
  height: number;
};

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cell = 20,
): void {
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const even = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      ctx.fillStyle = even ? "#1a1a1a" : "#2a2a2a";
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  ringThickness: number,
  color: string,
): void {
  if (outerR <= 0) return;

  if (ringThickness <= 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const holeRatio = Math.min(0.95, Math.max(0.05, ringThickness / 100));
  const innerR = outerR * holeRatio;
  const bandWidth = outerR - innerR;

  if (bandWidth < 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, bandWidth);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - bandWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  block: MosaicBlock,
  grid: GridDimensions,
  ringThickness: number,
): void {
  const x = block.col * grid.cellSize;
  const y = block.row * grid.cellSize;
  const drawW = block.width * grid.cellSize;
  const drawH = block.height * grid.cellSize;

  if (block.shape === "ring") {
    const diameter = Math.min(drawW, drawH);
    drawRing(
      ctx,
      x + drawW / 2,
      y + drawH / 2,
      diameter / 2,
      ringThickness,
      block.color,
    );
    return;
  }

  if (block.shape === "sphere") {
    const diameter = Math.min(drawW, drawH);
    const cx = x + drawW / 2;
    const cy = y + drawH / 2;
    ctx.fillStyle = block.color;
    ctx.beginPath();
    ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.fillStyle = block.color;
  ctx.fillRect(x, y, drawW, drawH);
}

export function renderMosaic(
  canvas: HTMLCanvasElement,
  options: RenderOptions,
): GridDimensions {
  const { orientation, settings, blocks, width, height } = options;
  const grid = getGridDimensions(orientation, settings.density, width, height);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  ctx.clearRect(0, 0, width, height);

  if (settings.background === "black") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  } else {
    drawCheckerboard(ctx, width, height);
  }

  for (const block of blocks) {
    if (!block.color) continue;
    drawBlock(ctx, block, grid, settings.ringThickness);
  }

  return grid;
}

export function renderMosaicToBlob(
  options: RenderOptions,
): Promise<Blob | null> {
  const offscreen = document.createElement("canvas");
  renderMosaic(offscreen, options);
  return new Promise((resolve) => {
    offscreen.toBlob((blob) => resolve(blob), "image/png");
  });
}
