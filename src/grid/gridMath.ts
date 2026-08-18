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

/** Largest integer square inside a rect, centred with floor. */
export function inscribedPixelSquare(rect: PixelRect): PixelRect {
  const size = Math.min(rect.width, rect.height);
  return {
    x: rect.x + Math.floor((rect.width - size) / 2),
    y: rect.y + Math.floor((rect.height - size) / 2),
    width: size,
    height: size,
  };
}

/** Upper-right isosceles right triangle inside the inscribed square. */
export function triangleFillPoints(
  rect: PixelRect,
): [[number, number], [number, number], [number, number]] {
  const { x, y, width: size } = inscribedPixelSquare(rect);
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
  ];
}

/** ~1/3 of the square in cells, nudged so the plus centres on the lattice. */
function crossArmCells(size: number): number {
  let arm = Math.max(1, Math.round(size / 3));
  if ((size - arm) % 2 !== 0) {
    const target = size / 3;
    const candidates = [arm - 1, arm + 1].filter((a) => a >= 1 && a <= size);
    if (candidates.length > 0) {
      arm = candidates.reduce((best, a) =>
        Math.abs(a - target) < Math.abs(best - target) ? a : best,
      );
    }
  }
  return arm;
}

/**
 * Plus-shaped cross in the inscribed square of `block`, snapped to grid cells.
 * Arm thickness is ~1/3 of the square in cells so bar edges share neighbours'
 * grid lines (pixel thirds drift off the lattice).
 */
export function crossFillRects(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
): { horizontal: PixelRect; vertical: PixelRect } {
  const size = Math.min(block.width, block.height);
  const col0 = block.col + Math.floor((block.width - size) / 2);
  const row0 = block.row + Math.floor((block.height - size) / 2);
  const arm = crossArmCells(size);
  const midCol = col0 + (size - arm) / 2;
  const midRow = row0 + (size - arm) / 2;

  const x = gridEdge(col0, grid.columns, grid.width);
  const x2 = gridEdge(col0 + size, grid.columns, grid.width);
  const y = gridEdge(row0, grid.rows, grid.height);
  const y2 = gridEdge(row0 + size, grid.rows, grid.height);
  const armX = gridEdge(midCol, grid.columns, grid.width);
  const armX2 = gridEdge(midCol + arm, grid.columns, grid.width);
  const armY = gridEdge(midRow, grid.rows, grid.height);
  const armY2 = gridEdge(midRow + arm, grid.rows, grid.height);

  return {
    horizontal: { x, y: armY, width: x2 - x, height: armY2 - armY },
    vertical: { x: armX, y, width: armX2 - armX, height: y2 - y },
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

export function clientToCanvasPixel(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function pixelToGridCell(
  grid: GridDimensions,
  x: number,
  y: number,
): { col: number; row: number } | null {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  const col = Math.floor(x / grid.cellSize);
  const row = Math.floor(y / grid.cellSize);
  if (col >= grid.columns || row >= grid.rows) return null;
  return { col, row };
}
