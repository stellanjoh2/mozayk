import {
  blockPixelRect,
  crossFillRects,
  getGridDimensions,
  triangleFillPoints,
} from "../grid/gridMath";
import { drawCoverImage } from "../import/imageSource";
import type {
  FrameSettings,
  GridDimensions,
  MosaicBlock,
  Orientation,
} from "../types";
import { applyBonusFx } from "./bonusFx";
import { blockCornerRadiusPx } from "./cornerRadius";
import { drawDataFields } from "./dataFields";
import { applyGridBlur } from "./gridBlur";
import {
  gridCrossesPathData,
  gridOverlayDimensions,
  gridOverlayPathData,
  resolveGridCrossesStyle,
  resolveGridOverlayStyle,
  scaledOverlayLineWidth,
  type GridOverlayStyle,
} from "./gridOverlay";
import { largestRingRadius, ringInnerRadius } from "./ringGeometry";
import {
  insetCrossRects,
  insetPixelRect,
  shapeGapInsetPx,
} from "./shapeGap";
import { applyTextureOverlay } from "./textureOverlay";
import { drawDensityGrid } from "./pieceOverlay";
import {
  drawWireframeBlock,
  peeledBlockSet,
  resolveWireframePeelStroke,
} from "./wireframePeel";

export type RenderOptions = {
  orientation: Orientation;
  settings: FrameSettings;
  blocks: MosaicBlock[];
  width: number;
  height: number;
  /** Loaded source photo — required when settings.showSourceImage is enabled. */
  sourceImage?: HTMLImageElement | null;
  /** Local background photo when frame.backgroundImage is set. */
  backgroundImage?: HTMLImageElement | null;
  /** Local texture overlay image when frame.textureOverlay is set. */
  textureOverlayImage?: HTMLImageElement | null;
  /** Skip drawing blocks with these colours (export holes). */
  omitColors?: ReadonlySet<string>;
  /** Clear alpha background instead of black/checkerboard. */
  transparentBackground?: boolean;
  /** Pulse the selected block between 0.5 and 1.0 opacity. */
  selectedBlockIndex?: number | null;
  selectionPulseOpacity?: number;
  /** Lifted piece preview while dragging to a valid slot. */
  dragPreview?: { blockIndex: number; col: number; row: number } | null;
  /** Opacity pulse for the held drag preview (0.5–1.0). */
  dragPreviewPulseOpacity?: number;
  /** White fade after a piece snaps to a new slot (0–1 over 500ms). */
  dropBlinkBlockIndex?: number | null;
  dropBlinkT?: number | null;
  /** Layout-density skeleton, drawn above background while grabbing a piece. */
  showDensityGrid?: boolean;
  /** Canvas backing pixels per CSS pixel — keeps skeleton stroke at 1px on screen. */
  displayScale?: number;
  /** Skip Gaussian blur — live 30fps playback OOMs the GPU tab. Export is unchanged. */
  skipGridBlur?: boolean;
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
  fillRadius: number,
  gapInset: number,
): void {
  if (outerR <= 0) return;

  const r = outerR - gapInset;
  if (r <= 0) return;
  const innerBase = ringInnerRadius(
    outerR,
    ringThickness,
    cellSize,
    fillRadius,
  );
  const innerR = innerBase > 0 ? Math.max(0, innerBase - gapInset) : 0;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
  fillRadius: number,
  cornerRadius: number,
  shapeGap: number,
): void {
  const raw = blockPixelRect(grid, block);
  const rect = insetPixelRect(raw, shapeGap, grid.cellSize);
  const { x, y, width: drawW, height: drawH } = rect;
  const gapInset = shapeGapInsetPx(shapeGap, grid.cellSize);

  if (block.shape === "ring") {
    drawRing(
      ctx,
      raw.x + raw.width / 2,
      raw.y + raw.height / 2,
      Math.min(raw.width, raw.height) / 2,
      ringThickness,
      grid.cellSize,
      block.color,
      fillRadius,
      gapInset,
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
    const points = triangleFillPoints(rect);
    ctx.fillStyle = block.color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineTo(points[2][0], points[2][1]);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (block.shape === "cross") {
    const arms = crossFillRects(grid, block);
    const { horizontal, vertical } = insetCrossRects(
      arms.horizontal,
      arms.vertical,
      shapeGap,
      grid.cellSize,
    );
    ctx.fillStyle = block.color;
    ctx.fillRect(
      horizontal.x,
      horizontal.y,
      horizontal.width,
      horizontal.height,
    );
    ctx.fillRect(vertical.x, vertical.y, vertical.width, vertical.height);
    return;
  }

  ctx.fillStyle = block.color;
  const radius = Math.min(
    blockCornerRadiusPx(raw.width, raw.height, cornerRadius),
    drawW / 2,
    drawH / 2,
  );
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, drawW, drawH, radius);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, drawW, drawH);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  settings: FrameSettings,
  width: number,
  height: number,
  sourceImage?: HTMLImageElement | null,
  backgroundImage?: HTMLImageElement | null,
): void {
  if (settings.showSourceImage && sourceImage) {
    drawCoverImage(ctx, sourceImage, width, height);
    return;
  }

  if (settings.transparentBackground) {
    drawCheckerboard(ctx, width, height);
    return;
  }

  if (backgroundImage) {
    drawCoverImage(ctx, backgroundImage, width, height);
    return;
  }

  ctx.fillStyle = settings.background || "#000000";
  ctx.fillRect(0, 0, width, height);
}

function strokeOverlayPath(
  ctx: CanvasRenderingContext2D,
  style: GridOverlayStyle,
  d: string,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.globalAlpha = style.opacity;
  if (style.blendMode !== "normal") {
    ctx.globalCompositeOperation = style.blendMode;
  }
  ctx.strokeStyle = style.color;
  ctx.lineWidth = scaledOverlayLineWidth(style.lineWidth, width, height);
  ctx.stroke(new Path2D(d));
  ctx.restore();
}

function drawGridOverlay(
  ctx: CanvasRenderingContext2D,
  orientation: Orientation,
  settings: FrameSettings,
  width: number,
  height: number,
): void {
  const lines = resolveGridOverlayStyle(settings);
  if (lines) {
    const grid = gridOverlayDimensions(orientation, width, height, lines);
    strokeOverlayPath(
      ctx,
      lines,
      gridOverlayPathData(grid, lines.chaos, settings.gridOverlaySeed ?? 0),
      width,
      height,
    );
  }

  const crosses = resolveGridCrossesStyle(settings);
  if (crosses) {
    const grid = gridOverlayDimensions(orientation, width, height, crosses);
    strokeOverlayPath(
      ctx,
      crosses,
      gridCrossesPathData(
        grid,
        crosses.chaos,
        crosses.size,
        settings.gridCrossesSeed ?? 0,
      ),
      width,
      height,
    );
  }
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
    backgroundImage,
    textureOverlayImage,
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
    drawBackground(
      ctx,
      settings,
      width,
      height,
      sourceImage,
      backgroundImage,
    );
  }

  if (options.showDensityGrid) {
    drawDensityGrid(ctx, grid, options.displayScale ?? 1);
  }

  const fillRadius = largestRingRadius(blocks, grid);
  const peeled = peeledBlockSet(blocks, settings);
  const peelStroke = resolveWireframePeelStroke(settings.wireframePeelStroke);
  const {
    selectedBlockIndex = null,
    selectionPulseOpacity,
    dragPreview = null,
    dragPreviewPulseOpacity,
    dropBlinkBlockIndex = null,
    dropBlinkT = null,
  } = options;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!block.color) continue;
    if (omitColors?.has(block.color)) continue;

    const isDropBlink =
      dropBlinkBlockIndex === index &&
      dropBlinkT != null &&
      dropBlinkT < 1;
    if (isDropBlink) {
      if (peeled.has(block)) {
        drawWireframeBlock(
          ctx,
          block,
          grid,
          peelStroke,
          settings.cornerRadius,
          settings.shapeGap,
        );
      } else {
        drawBlock(
          ctx,
          block,
          grid,
          settings.ringThickness,
          fillRadius,
          settings.cornerRadius ?? 0,
          settings.shapeGap ?? 0,
        );
      }
      ctx.save();
      ctx.globalAlpha = 1 - dropBlinkT;
      drawBlock(
        ctx,
        { ...block, color: "#ffffff" },
        grid,
        settings.ringThickness,
        fillRadius,
        settings.cornerRadius ?? 0,
        settings.shapeGap ?? 0,
      );
      ctx.restore();
      continue;
    }

    const isSelected =
      selectedBlockIndex === index && selectionPulseOpacity != null;
    const isDragSource = dragPreview?.blockIndex === index;
    if (isSelected || isDragSource) {
      ctx.save();
      if (isSelected) ctx.globalAlpha = selectionPulseOpacity!;
      else if (isDragSource) ctx.globalAlpha = 0.35;
    }
    if (peeled.has(block)) {
      drawWireframeBlock(
        ctx,
        block,
        grid,
        peelStroke,
        settings.cornerRadius,
        settings.shapeGap,
      );
    } else {
      drawBlock(
        ctx,
        block,
        grid,
        settings.ringThickness,
        fillRadius,
        settings.cornerRadius ?? 0,
        settings.shapeGap ?? 0,
      );
    }
    if (isSelected || isDragSource) {
      ctx.restore();
    }
  }

  if (dragPreview) {
    const block = blocks[dragPreview.blockIndex];
    if (block?.color && !omitColors?.has(block.color)) {
      const previewBlock = {
        ...block,
        col: dragPreview.col,
        row: dragPreview.row,
      };
      if (dragPreviewPulseOpacity != null) {
        ctx.save();
        ctx.globalAlpha = dragPreviewPulseOpacity;
      }
      if (peeled.has(block)) {
        drawWireframeBlock(
          ctx,
          previewBlock,
          grid,
          peelStroke,
          settings.cornerRadius,
          settings.shapeGap,
        );
      } else {
        drawBlock(
          ctx,
          previewBlock,
          grid,
          settings.ringThickness,
          fillRadius,
          settings.cornerRadius ?? 0,
          settings.shapeGap ?? 0,
        );
      }
      if (dragPreviewPulseOpacity != null) {
        ctx.restore();
      }
    }
  }

  try {
    if (settings.gridOverlay || settings.gridCrosses) {
      drawGridOverlay(ctx, orientation, settings, width, height);
    }
  } catch (error) {
    console.error(error);
  }

  try {
    drawDataFields(ctx, orientation, settings, width, height);
  } catch (error) {
    console.error(error);
  }

  if (!options.skipGridBlur) {
    applyGridBlur(
      ctx,
      orientation,
      settings,
      width,
      height,
      !transparentBackground,
    );
  }
  applyBonusFx(ctx, settings, width, height);

  if (textureOverlayImage) {
    try {
      applyTextureOverlay(
        ctx,
        textureOverlayImage,
        settings,
        width,
        height,
      );
    } catch (error) {
      console.error(error);
    }
  }

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
  try {
    renderMosaic(offscreen, options);
  } catch (error) {
    console.error(error);
    return Promise.resolve(null);
  }
  if (offscreen.width === 0 || offscreen.height === 0) {
    return Promise.resolve(null);
  }
  const output = options.transparentBackground
    ? offscreen
    : stackPngPasses(offscreen, PNG_STACK_PASSES);
  return new Promise((resolve) => {
    output.toBlob((blob) => resolve(blob), "image/png");
  });
}
