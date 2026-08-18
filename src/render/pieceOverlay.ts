import { gridEdge } from "../grid/gridMath";
import type { GridCorner } from "../layout/blockPlacement";
import type { GridDimensions } from "../types";

const DROP_ZONE_STROKE = "rgba(57, 255, 20, 0.75)";
const DROP_ZONE_STROKE_CSS_PX = 2;

export type PieceOverlayOptions = {
  dropZoneLoops?: GridCorner[][];
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
  ctx.strokeStyle = DROP_ZONE_STROKE;
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
  const { dropZoneLoops = [], displayScale = 1 } = options;

  canvas.width = grid.width;
  canvas.height = grid.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, grid.width, grid.height);
  drawDropZoneOutline(ctx, dropZoneLoops, grid, displayScale);
}

export function selectionPulseOpacity(phase: number): number {
  return 0.75 + 0.25 * Math.sin(phase * Math.PI * 2);
}

/** Held drag preview — 1.0 down to 0.25. */
export function heldPiecePulseOpacity(phase: number): number {
  return 0.625 + 0.375 * Math.sin(phase * Math.PI * 2);
}

/** Hard on/off — matches timeline-flood (two blinks over 250ms). */
export function dropBlinkOpacity(t: number): number {
  if (t < 0.25) return 1;
  if (t < 0.5) return 0;
  if (t < 0.75) return 1;
  return 0;
}
