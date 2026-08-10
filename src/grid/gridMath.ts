import type { Density, GridDimensions, MosaicBlock, Orientation } from "../types";

export function getThumbnailSize(
  orientation: Orientation,
  density: Density,
  pixelsPerCell = 2,
): [number, number] {
  if (orientation === "landscape") {
    return [16 * density * pixelsPerCell, 9 * density * pixelsPerCell];
  }
  return [9 * density * pixelsPerCell, 16 * density * pixelsPerCell];
}


export function getGridCounts(
  orientation: Orientation,
  density: Density,
): { columns: number; rows: number } {
  const k = density;
  if (orientation === "landscape") {
    return { columns: 16 * k, rows: 9 * k };
  }
  return { columns: 9 * k, rows: 16 * k };
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
