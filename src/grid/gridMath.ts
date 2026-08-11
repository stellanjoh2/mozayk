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

/** Pixel-snapped block bounds — avoids sub-pixel seams when cell size is fractional. */
export function blockPixelRect(
  grid: GridDimensions,
  block: Pick<MosaicBlock, "col" | "row" | "width" | "height">,
): { x: number; y: number; width: number; height: number } {
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
