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

export function getThumbnailSize(
  orientation: Orientation,
  pixelsPerCell = 2,
): [number, number] {
  const density = REFERENCE_DENSITY;
  const { cols, rows } = getGridAspect(orientation);
  return [cols * density * pixelsPerCell, rows * density * pixelsPerCell];
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
 * Hairline overlap so adjacent fills cover canvas/SVG anti-aliasing and CSS
 * downscale interpolation. Skip on tiny thumbnail cells where 1px is huge.
 */
export function seamOverlapPx(grid: GridDimensions): number {
  return grid.cellSize >= 4 ? 1 : 0;
}

/** Pixel-snapped block bounds — shared edges stay identical for adjacent blocks. */
export function blockPixelRect(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
): PixelRect {
  const x = Math.round((block.col / grid.columns) * grid.width);
  const y = Math.round((block.row / grid.rows) * grid.height);
  const x2 = Math.round(
    ((block.col + block.width) / grid.columns) * grid.width,
  );
  const y2 = Math.round(
    ((block.row + block.height) / grid.rows) * grid.height,
  );
  return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * Draw bounds that overlap neighbours by 1px so background cannot show through
 * a 0.5px gap. Geometry of circles/triangles should still use `blockPixelRect`.
 */
export function blockFillRect(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
): PixelRect {
  const rect = blockPixelRect(grid, block);
  const overlap = seamOverlapPx(grid);
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
