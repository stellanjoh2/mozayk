import { REFERENCE_DENSITY } from "./density";
import type { Density, GridDimensions, MosaicBlock, Orientation } from "../types";

const GRID_ASPECT: Record<Orientation, { cols: number; rows: number }> = {
  landscape: { cols: 16, rows: 9 },
  portrait: { cols: 9, rows: 16 },
  square: { cols: 9, rows: 9 },
};

export function getGridAspect(orientation: Orientation): { cols: number; rows: number } {
  return GRID_ASPECT[orientation];
}

/** CSS size of timeline thumbs — 2px per cell at reference density (96×54 landscape). */
export const THUMBNAIL_DISPLAY_PIXELS_PER_CELL = 2;

/**
 * Backing-store size for timeline thumbs. Blur, grain, and the texture overlay
 * need more pixels than the display size or they collapse to a sharp mosaic.
 * 10px/cell at reference density is 480×270 landscape — a 16:9 mosaic size.
 */
export const THUMBNAIL_RENDER_PIXELS_PER_CELL = 10;

export function getThumbnailSize(
  orientation: Orientation,
  pixelsPerCell = THUMBNAIL_DISPLAY_PIXELS_PER_CELL,
): [number, number] {
  const density = REFERENCE_DENSITY;
  const { cols, rows } = getGridAspect(orientation);
  return [cols * density * pixelsPerCell, rows * density * pixelsPerCell];
}

export function getThumbnailRenderSize(
  orientation: Orientation,
): [number, number] {
  return getThumbnailSize(orientation, THUMBNAIL_RENDER_PIXELS_PER_CELL);
}

export function getGridCounts(
  orientation: Orientation,
  density: Density,
): { columns: number; rows: number } {
  const { cols, rows } = getGridAspect(orientation);
  return { columns: cols * density, rows: rows * density };
}

export function getGridDimensions(
  orientation: Orientation,
  density: Density,
  width: number,
  height: number,
): GridDimensions {
  const { columns, rows } = getGridCounts(orientation, density);
  const cellW = width / columns;
  const cellH = height / rows;

  if (Math.abs(cellW - cellH) > 0.001) {
    throw new Error(
      `Invalid canvas ${width}×${height} for grid ${columns}×${rows}`,
    );
  }

  return { columns, rows, cellSize: cellW, width, height };
}

export type PixelRect = { x: number; y: number; width: number; height: number };

/**
 * Exclusive pixel coordinate of grid line `index` (0..count).
 * Adjacent blocks share this value, so a straight run of the same column
 * never jogs by a rounded pixel.
 */
export function gridEdge(index: number, count: number, size: number): number {
  if (index <= 0) return 0;
  if (index >= count) return size;
  return Math.round((index / count) * size);
}

/**
 * Extra fill expand when grid blur would otherwise reveal seams.
 * Default drawing must stay at `blockPixelRect` — a uniform 1px expand
 * creates T-junction offshoots on edges that should be straight.
 */
export function seamOverlapPx(grid: GridDimensions, heavy = false): number {
  if (!heavy) return 0;
  if (grid.cellSize >= 8) return 2;
  if (grid.cellSize >= 4) return 1;
  return 0;
}

/** Pixel-snapped block bounds — shared edges stay identical for adjacent blocks. */
export function blockPixelRect(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
): PixelRect {
  const x = gridEdge(block.col, grid.columns, grid.width);
  const y = gridEdge(block.row, grid.rows, grid.height);
  const x2 = gridEdge(block.col + block.width, grid.columns, grid.width);
  const y2 = gridEdge(block.row + block.height, grid.rows, grid.height);
  return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * Draw bounds expanded by `overlapPx` (or heavy-blur seam overlap).
 * Geometry of circles/triangles should still use `blockPixelRect`.
 */
export function blockFillRect(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
  heavy = false,
  overlapPx?: number,
): PixelRect {
  const rect = blockPixelRect(grid, block);
  const overlap = overlapPx ?? seamOverlapPx(grid, heavy);
  if (overlap <= 0) return rect;

  const x = Math.max(0, rect.x - overlap);
  const y = Math.max(0, rect.y - overlap);
  const x2 = Math.min(grid.width, rect.x + rect.width + overlap);
  const y2 = Math.min(grid.height, rect.y + rect.height + overlap);
  return { x, y, width: x2 - x, height: y2 - y };
}

/** Integer-pixel square inscribed in a rect (avoids half-pixel triangle edges). */
export function inscribedPixelSquare(rect: PixelRect): PixelRect {
  const size = Math.min(rect.width, rect.height);
  return {
    x: rect.x + Math.floor((rect.width - size) / 2),
    y: rect.y + Math.floor((rect.height - size) / 2),
    width: size,
    height: size,
  };
}

/** Upper-right right triangle, expanded so anti-aliased edges cover neighbours. */
export function triangleFillPoints(
  rect: PixelRect,
  overlap = 0,
): [[number, number], [number, number], [number, number]] {
  const square = inscribedPixelSquare(rect);
  const { x: ox, y: oy, width: size } = square;
  return [
    [ox - overlap, oy - overlap],
    [ox + size + overlap, oy - overlap],
    [ox + size + overlap, oy + size + overlap],
  ];
}

/**
 * Plus-shaped cross: full-span bars through the inscribed square.
 * Arm thickness is ~1/3 of the square so the silhouette stays readable at
 * small cell sizes. Expanded by `overlap` for seam coverage.
 */
export function crossFillRects(
  rect: PixelRect,
  overlap = 0,
): { horizontal: PixelRect; vertical: PixelRect } {
  const square = inscribedPixelSquare(rect);
  const { x: ox, y: oy, width: size } = square;
  const arm = Math.max(1, Math.round(size / 3));
  const mid = ox + Math.floor((size - arm) / 2);
  const midY = oy + Math.floor((size - arm) / 2);

  return {
    horizontal: {
      x: ox - overlap,
      y: midY - overlap,
      width: size + overlap * 2,
      height: arm + overlap * 2,
    },
    vertical: {
      x: mid - overlap,
      y: oy - overlap,
      width: arm + overlap * 2,
      height: size + overlap * 2,
    },
  };
}

export function transposeBlocks(blocks: MosaicBlock[]): MosaicBlock[] {
  return blocks.map((block) => ({
    ...block,
    col: block.row,
    row: block.col,
    width: block.height,
    height: block.width,
  }));
}

export function maxGridSpan(density: Density, orientation: Orientation): number {
  const { columns, rows } = getGridCounts(orientation, density);
  return Math.max(columns, rows);
}
