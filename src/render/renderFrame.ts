import {
  blockFillRect,
  blockPixelRect,
  getGridDimensions,
  seamOverlapPx,
  triangleFillPoints,
} from "../grid/gridMath";
import { drawCoverImage } from "../import/imageSource";
import type {
  FrameSettings,
  GridDimensions,
  MosaicBlock,
  Orientation,
} from "../types";
import { applyGridBlur } from "./gridBlur";
import {
  gridOverlayDimensions,
  gridOverlayPathData,
  resolveGridOverlayStyle,
} from "./gridOverlay";
import { ringInnerRadius } from "./ringGeometry";

export type RenderOptions = {
  orientation: Orientation;
  settings: FrameSettings;
  blocks: MosaicBlock[];
  width: number;
  height: number;
  /** Loaded source photo — required when settings.showSourceImage is enabled. */
  sourceImage?: HTMLImageElement | null;
  /** Skip drawing blocks with these colours (export holes). */
  omitColors?: ReadonlySet<string>;
  /** Clear alpha background instead of black/checkerboard. */
  transparentBackground?: boolean;
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
  cellSize: number,
  color: string,
): void {
  if (outerR <= 0) return;

  const innerR = ringInnerRadius(outerR, ringThickness, cellSize);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  if (innerR > 0) {
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    return;
  }
  ctx.fill();
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  block: MosaicBlock,
  grid: GridDimensions,
  ringThickness: number,
): void {
  const { x, y, width: drawW, height: drawH } = blockPixelRect(grid, block);

  if (block.shape === "ring") {
    const diameter = Math.min(drawW, drawH);
    drawRing(
      ctx,
      x + drawW / 2,
      y + drawH / 2,
      diameter / 2,
      ringThickness,
      grid.cellSize,
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

  if (block.shape === "triangle") {
    const points = triangleFillPoints(
      { x, y, width: drawW, height: drawH },
      seamOverlapPx(grid),
    );
    ctx.fillStyle = block.color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
    ctx.fill();
    return;
  }

  const fill = blockFillRect(grid, block);
  ctx.fillStyle = block.color;
  ctx.fillRect(fill.x, fill.y, fill.width, fill.height);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  settings: FrameSettings,
  width: number,
  height: number,
  sourceImage?: HTMLImageElement | null,
): void {
  if (settings.showSourceImage && sourceImage) {
    drawCoverImage(ctx, sourceImage, width, height);
    return;
  }

  if (settings.background === "black") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    return;
  }

  drawCheckerboard(ctx, width, height);
}

function drawGridOverlay(
  ctx: CanvasRenderingContext2D,
  orientation: Orientation,
  settings: FrameSettings,
  width: number,
  height: number,
): void {
  const style = resolveGridOverlayStyle(settings);
  if (!style) return;

  const grid = gridOverlayDimensions(orientation, width, height, style);

  ctx.save();
  ctx.globalAlpha = style.opacity;
  if (style.difference) {
    ctx.globalCompositeOperation = "difference";
  }
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.lineWidth;
  ctx.stroke(new Path2D(gridOverlayPathData(grid, style.chaos)));
  ctx.restore();
}

export function renderMosaic(
  canvas: HTMLCanvasElement,
  options: RenderOptions,
): GridDimensions {
  const {
    orientation,
    settings,
    blocks,
    width,
    height,
    sourceImage,
    omitColors,
    transparentBackground,
  } = options;
  const grid = getGridDimensions(orientation, settings.density, width, height);

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  ctx.clearRect(0, 0, width, height);
  if (transparentBackground) {
    if (settings.showSourceImage && sourceImage) {
      drawCoverImage(ctx, sourceImage, width, height);
    }
  } else {
    drawBackground(ctx, settings, width, height, sourceImage);
  }

  for (const block of blocks) {
    if (!block.color) continue;
    if (omitColors?.has(block.color)) continue;
    drawBlock(ctx, block, grid, settings.ringThickness);
  }

  if (settings.gridOverlay) {
    drawGridOverlay(ctx, orientation, settings, width, height);
  }

  applyGridBlur(
    ctx,
    orientation,
    settings,
    width,
    height,
    !transparentBackground,
  );

  return grid;
}

/** Photoshop: duplicate the export layer 3 times, then flatten. */
const PNG_STACK_PASSES = 3;

function stackPngPasses(
  source: HTMLCanvasElement,
  passes: number,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  for (let i = 0; i < passes; i++) {
    ctx.drawImage(source, 0, 0);
  }
  return out;
}

export function renderMosaicToBlob(
  options: RenderOptions,
): Promise<Blob | null> {
  const offscreen = document.createElement("canvas");
  renderMosaic(offscreen, options);
  const output = options.transparentBackground
    ? offscreen
    : stackPngPasses(offscreen, PNG_STACK_PASSES);
  return new Promise((resolve) => {
    output.toBlob((blob) => resolve(blob), "image/png");
  });
}
