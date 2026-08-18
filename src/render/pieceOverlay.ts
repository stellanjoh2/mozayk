import { gridEdge } from "../grid/gridMath";
import type { GridCorner } from "../layout/blockPlacement";
import type { GridDimensions, MosaicBlock } from "../types";
import { resolveCssColor } from "../ui/theme";
import { drawBlockInnerStroke } from "./wireframePeel";

const DROP_ZONE_STROKE_CSS_PX = 2;
const DENSITY_GRID_STROKE_CSS_PX = 1;

export type PieceOverlayOptions = {
  dropZoneLoops?: GridCorner[][];
  /** Shape-accurate outline around the held drag preview. */
  heldBlock?: MosaicBlock | null;
  heldStrokeVisible?: boolean;
  cornerRadius?: number;
  shapeGap?: number;
  /** Canvas backing pixels per CSS pixel — keeps stroke width on screen. */
  displayScale?: number;
};

function addLoopToPath(
  ctx: CanvasRenderingContext2D,
  loop: GridCorner[],
  grid: GridDimensions,
): void {
  if (loop.length === 0) return;

  const [first, ...rest] = loop;
  ctx.moveTo(
    gridEdge(first.col, grid.columns, grid.width),
    gridEdge(first.row, grid.rows, grid.height),
  );
  for (const corner of rest) {
    ctx.lineTo(
      gridEdge(corner.col, grid.columns, grid.width),
      gridEdge(corner.row, grid.rows, grid.height),
    );
  }
  ctx.closePath();
}

export function drawDensityGrid(
  ctx: CanvasRenderingContext2D,
  grid: GridDimensions,
  displayScale: number,
): void {
  const strokeWidth = DENSITY_GRID_STROKE_CSS_PX * displayScale;

  ctx.save();
  ctx.beginPath();
  for (let c = 1; c < grid.columns; c++) {
    const x = gridEdge(c, grid.columns, grid.width);
    ctx.moveTo(x, -1);
    ctx.lineTo(x, grid.height + 1);
  }
  for (let r = 1; r < grid.rows; r++) {
    const y = gridEdge(r, grid.rows, grid.height);
    ctx.moveTo(-1, y);
    ctx.lineTo(grid.width + 1, y);
  }
  ctx.strokeStyle = resolveCssColor("--piece-guide-grid");
  ctx.lineWidth = strokeWidth;
  ctx.stroke();
  ctx.restore();
}

function drawDropZoneOutline(
  ctx: CanvasRenderingContext2D,
  loops: GridCorner[][],
  grid: GridDimensions,
  displayScale: number,
): void {
  if (loops.length === 0) return;

  const strokeWidth = DROP_ZONE_STROKE_CSS_PX * displayScale;

  ctx.save();
  ctx.beginPath();
  for (const loop of loops) {
    addLoopToPath(ctx, loop, grid);
  }
  ctx.strokeStyle = resolveCssColor("--piece-guide-dropzone");
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "miter";
  ctx.stroke();
  ctx.restore();
}

export function renderPieceOverlay(
  canvas: HTMLCanvasElement,
  grid: GridDimensions,
  options: PieceOverlayOptions,
): void {
  const {
    dropZoneLoops = [],
    heldBlock = null,
    heldStrokeVisible = false,
    cornerRadius,
    shapeGap,
    displayScale = 1,
  } = options;

  canvas.width = grid.width;
  canvas.height = grid.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, grid.width, grid.height);
  drawDropZoneOutline(ctx, dropZoneLoops, grid, displayScale);
  if (heldStrokeVisible && heldBlock) {
    drawBlockInnerStroke(
      ctx,
      heldBlock,
      grid,
      DROP_ZONE_STROKE_CSS_PX * displayScale,
      resolveCssColor("--piece-guide-dropzone"),
      cornerRadius,
      shapeGap,
    );
  }
}

export function selectionPulseOpacity(phase: number): number {
  return 0.75 + 0.25 * Math.sin(phase * Math.PI * 2);
}

/** Held drag preview — 1.0 down to 0.25. */
export function heldPiecePulseOpacity(phase: number): number {
  return 0.625 + 0.375 * Math.sin(phase * Math.PI * 2);
}

/** Hard on/off — same 0.125s duty as hover-plate-blink (phase is 2 Hz while dragging). */
export function hoverBlinkVisible(phase: number): boolean {
  return (phase * 4) % 1 < 0.5;
}
