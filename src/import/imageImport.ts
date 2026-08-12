import { rgbToHex } from "../colorMath";
import { getGridCounts } from "../grid/gridMath";
import { assignShape, type Rng } from "../shapes/shapePalette";
import type {
  FrameSettings,
  MosaicBlock,
  Orientation,
  ShapeType,
} from "../types";
import {
  cacheSourceImage,
  coverCropRect,
  imageToDataUrl,
  type ImageRgb,
  type ImageSourceData,
} from "./imageSource";

export const IMPORT_COLOR_COUNT = 8;

export type ImageImportResult = {
  colors: string[];
  colorAmounts: number[];
  blocks: MosaicBlock[];
  imageSource: ImageSourceData;
};

type Rgb = ImageRgb;

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function nearestPaletteIndex(color: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i++) {
    const dist = colorDistance(color, palette[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function kMeans(
  pixels: Rgb[],
  k: number,
  maxIterations = 24,
): { centers: Rgb[]; counts: number[] } {
  if (pixels.length === 0) {
    return { centers: [{ r: 0, g: 0, b: 0 }], counts: [1] };
  }

  const clusterCount = Math.min(k, pixels.length);
  const centers: Rgb[] = [];
  const used = new Set<number>();
  while (centers.length < clusterCount) {
    const index = Math.floor(Math.random() * pixels.length);
    if (used.has(index)) continue;
    used.add(index);
    centers.push({ ...pixels[index] });
  }

  const assignments = new Array<number>(pixels.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let i = 0; i < pixels.length; i++) {
      const next = nearestPaletteIndex(pixels[i], centers);
      if (assignments[i] !== next) {
        assignments[i] = next;
        changed = true;
      }
    }

    if (!changed) break;

    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let i = 0; i < pixels.length; i++) {
      const cluster = assignments[i];
      sums[cluster].r += pixels[i].r;
      sums[cluster].g += pixels[i].g;
      sums[cluster].b += pixels[i].b;
      sums[cluster].count += 1;
    }

    for (let c = 0; c < centers.length; c++) {
      if (sums[c].count === 0) {
        centers[c] = { ...pixels[Math.floor(Math.random() * pixels.length)] };
        continue;
      }
      centers[c] = {
        r: sums[c].r / sums[c].count,
        g: sums[c].g / sums[c].count,
        b: sums[c].b / sums[c].count,
      };
    }
  }

  const counts = new Array(centers.length).fill(0);
  for (const assignment of assignments) {
    counts[assignment] += 1;
  }

  return { centers, counts };
}

function amountsFromCounts(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return [100];

  const raw = counts.map((count) => (count / total) * 100);
  const rounded = raw.map((value) => Math.max(1, Math.round(value)));
  const sum = rounded.reduce((acc, value) => acc + value, 0);
  const diff = 100 - sum;
  if (diff !== 0) {
    const peak = counts.indexOf(Math.max(...counts));
    rounded[peak] = Math.max(1, rounded[peak] + diff);
  }
  return rounded;
}

function shuffleCells<T>(items: T[], rng: Rng): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Scale blend 0..6 → contrast 0..1 (similar → large+small). */
function contrastFromScaleBlend(scaleBlend: number): number {
  return Math.min(1, Math.max(0, scaleBlend / 6));
}

/** Macro pool grows with contrast; 1 at low contrast (no coarsen). */
function poolSizeForContrast(contrast: number): number {
  if (contrast <= 0.05) return 1;
  return Math.max(2, Math.round(2 + contrast * 6));
}

function majorityIndex(indices: number[]): number {
  const counts = new Map<number, number>();
  for (const idx of indices) {
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  let best = indices[0];
  let bestCount = 0;
  for (const [idx, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = idx;
    }
  }
  return best;
}

function coarsenIndexedGrid(grid: number[][], pool: number): number[][] {
  if (pool <= 1) return grid;

  const rows = grid.length;
  const columns = grid[0]?.length ?? 0;
  const outRows = Math.ceil(rows / pool);
  const outCols = Math.ceil(columns / pool);
  const coarsened: number[][] = [];

  for (let or = 0; or < outRows; or++) {
    const line: number[] = [];
    for (let oc = 0; oc < outCols; oc++) {
      const indices: number[] = [];
      for (let r = or * pool; r < Math.min((or + 1) * pool, rows); r++) {
        for (let c = oc * pool; c < Math.min((oc + 1) * pool, columns); c++) {
          indices.push(grid[r][c]);
        }
      }
      line.push(majorityIndex(indices));
    }
    coarsened.push(line);
  }
  return coarsened;
}

function scaleBlocksToGrid(
  blocks: MosaicBlock[],
  pool: number,
  fullColumns: number,
  fullRows: number,
): MosaicBlock[] {
  if (pool <= 1) return blocks;

  return blocks.map((block) => {
    const col = block.col * pool;
    const row = block.row * pool;
    return {
      ...block,
      col,
      row,
      width: Math.min(block.width * pool, fullColumns - col),
      height: Math.min(block.height * pool, fullRows - row),
    };
  });
}

function inferShapeFromBlock(
  width: number,
  height: number,
  settings: FrameSettings,
  rng: Rng = Math.random,
): ShapeType {
  const size = Math.max(width, height);
  const isSquare = width === height;

  if (isSquare && size >= 4 && settings.shapes.ring && settings.shapeMix > 0) {
    if (settings.shapeMix >= 100) return "ring";
    if (rng() < settings.shapeMix / 100) return "ring";
  }

  if (isSquare && size <= 5 && settings.shapes.sphere && settings.shapeMix > 0) {
    if (settings.shapeMix >= 50) return "sphere";
    if (rng() < settings.shapeMix / 200) return "sphere";
  }

  return assignShape(settings, rng);
}

function growMergedBlock(
  grid: number[][],
  visited: boolean[][],
  row: number,
  col: number,
  rows: number,
  columns: number,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY,
): { width: number; height: number; colorIdx: number } {
  const colorIdx = grid[row][col];
  let width = 1;
  while (
    width < maxWidth &&
    col + width < columns &&
    !visited[row][col + width] &&
    grid[row][col + width] === colorIdx
  ) {
    width += 1;
  }

  let height = 1;
  let canGrow = true;
  while (canGrow && height < maxHeight && row + height < rows) {
    for (let c = col; c < col + width; c++) {
      if (visited[row + height][c] || grid[row + height][c] !== colorIdx) {
        canGrow = false;
        break;
      }
    }
    if (canGrow) height += 1;
  }

  return { width, height, colorIdx };
}

function mergeColorGrid(
  grid: number[][],
  colors: string[],
  settings: FrameSettings,
  rng: Rng = Math.random,
  randomOrder = false,
  options?: {
    preVisited?: boolean[][];
    /** Cap merge span for "similar size" / fine detail. Infinity = uncapped giants. */
    maxSpanForCell?: (rng: Rng) => number;
  },
): MosaicBlock[] {
  const rows = grid.length;
  const columns = grid[0]?.length ?? 0;
  const visited = options?.preVisited
    ? options.preVisited.map((line) => line.slice())
    : Array.from({ length: rows }, () => Array<boolean>(columns).fill(false));
  const blocks: MosaicBlock[] = [];

  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      cells.push({ row, col });
    }
  }

  const scanOrder = randomOrder ? shuffleCells(cells, rng) : cells;

  for (const { row, col } of scanOrder) {
    if (visited[row][col]) continue;

    const maxSpan = options?.maxSpanForCell?.(rng) ?? Number.POSITIVE_INFINITY;
    const { width, height, colorIdx } = growMergedBlock(
      grid,
      visited,
      row,
      col,
      rows,
      columns,
      maxSpan,
      maxSpan,
    );

    for (let r = row; r < row + height; r++) {
      for (let c = col; c < col + width; c++) {
        visited[r][c] = true;
      }
    }

    blocks.push({
      col,
      row,
      width,
      height,
      color: colors[colorIdx],
      shape: inferShapeFromBlock(width, height, settings, rng),
    });
  }

  return blocks;
}

function markBlocksOccupied(
  occupied: boolean[][],
  blocks: MosaicBlock[],
): void {
  for (const block of blocks) {
    for (let r = block.row; r < block.row + block.height; r++) {
      for (let c = block.col; c < block.col + block.width; c++) {
        if (occupied[r]?.[c] !== undefined) occupied[r][c] = true;
      }
    }
  }
}

/**
 * Contrast layout for photos:
 * - low contrast: capped merges → similar block sizes
 * - high contrast: keep some coarsened giants, fill leftovers with fine detail
 */
function buildBlocksFromIndexedGrid(
  indexedGrid: number[][],
  colors: string[],
  settings: FrameSettings,
  rng: Rng = Math.random,
  randomOrder = false,
): MosaicBlock[] {
  const fullColumns = indexedGrid[0]?.length ?? 0;
  const fullRows = indexedGrid.length;
  const contrast = contrastFromScaleBlend(settings.scaleBlend ?? 3);
  const pool = poolSizeForContrast(contrast);

  const occupied = Array.from({ length: fullRows }, () =>
    Array<boolean>(fullColumns).fill(false),
  );
  const kept: MosaicBlock[] = [];

  // Macro pass — only at meaningful contrast.
  if (pool > 1) {
    const coarse = coarsenIndexedGrid(indexedGrid, pool);
    let macroBlocks = mergeColorGrid(
      coarse,
      colors,
      settings,
      rng,
      randomOrder,
    );
    macroBlocks = scaleBlocksToGrid(
      macroBlocks,
      pool,
      fullColumns,
      fullRows,
    );

    const keepChance = 0.12 + contrast * 0.55;
    const candidates = randomOrder
      ? shuffleCells(macroBlocks, rng)
      : macroBlocks;
    for (const block of candidates) {
      const span = Math.max(block.width, block.height);
      if (span < pool * 2) continue;
      if (rng() > keepChance) continue;
      kept.push(block);
    }
    markBlocksOccupied(occupied, kept);
  }

  // Fine pass — cap span at low contrast; keep detail small beside giants at high contrast.
  const similarSpan = Math.max(2, Math.round(6 - contrast * 3));
  const fineMaxSpan = (cellRng: Rng) => {
    if (contrast <= 0.05) return similarSpan;
    // Occasional uncapped merge on fine grid adds a few extra large shapes.
    if (cellRng() < contrast * 0.12) return Number.POSITIVE_INFINITY;
    return Math.max(1, Math.round(2 + (1 - contrast) * 3));
  };

  const fineBlocks = mergeColorGrid(
    indexedGrid,
    colors,
    settings,
    rng,
    randomOrder,
    { preVisited: occupied, maxSpanForCell: fineMaxSpan },
  );

  const fill = Math.max(0, Math.min(100, settings.fillAmount ?? 100)) / 100;
  const merged =
    fill >= 0.999
      ? [...kept, ...fineBlocks]
      : fill <= 0
        ? []
        : [...kept, ...fineBlocks].filter(() => rng() < fill);

  return merged.map((block) => ({
    ...block,
    shape: inferShapeFromBlock(block.width, block.height, settings, rng),
  }));
}

/** Same merge pipeline as first import, with shuffled merge order for variation. */
export function buildMergedLayoutFromImage(
  image: HTMLImageElement,
  orientation: Orientation,
  settings: FrameSettings,
  palette: string[],
  paletteRgb: ImageRgb[],
  rng: Rng = Math.random,
): MosaicBlock[] {
  const { columns, rows } = getGridCounts(orientation, settings.density);
  const sampled = sampleImageGrid(image, columns, rows);
  const indexedGrid = sampled.map((line) =>
    line.map((pixel) => nearestPaletteIndex(pixel, paletteRgb)),
  );

  return buildBlocksFromIndexedGrid(
    indexedGrid,
    palette,
    settings,
    rng,
    true,
  );
}

function blocksFromCells(
  grid: number[][],
  colors: string[],
  settings: FrameSettings,
): MosaicBlock[] {
  const blocks: MosaicBlock[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const colorIdx = grid[row][col];
      blocks.push({
        col,
        row,
        width: 1,
        height: 1,
        color: colors[colorIdx],
        shape: inferShapeFromBlock(1, 1, settings),
      });
    }
  }
  return blocks;
}

export function sampleImageGrid(
  image: HTMLImageElement,
  columns: number,
  rows: number,
): Rgb[][] {
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  const { sx, sy, sw, sh } = coverCropRect(
    image.width,
    image.height,
    columns,
    rows,
  );

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, columns, rows);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, columns, rows);

  const { data } = ctx.getImageData(0, 0, columns, rows);
  const grid: Rgb[][] = [];

  for (let row = 0; row < rows; row++) {
    const line: Rgb[] = [];
    for (let col = 0; col < columns; col++) {
      const i = (row * columns + col) * 4;
      const alpha = data[i + 3] / 255;
      line.push({
        r: data[i] * alpha,
        g: data[i + 1] * alpha,
        b: data[i + 2] * alpha,
      });
    }
    grid.push(line);
  }

  return grid;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    image.src = url;
  });
}

export type ImageImportOptions = {
  mergeRegions?: boolean;
  colorCount?: number;
};

export function importImageToMosaic(
  image: HTMLImageElement,
  orientation: Orientation,
  settings: FrameSettings,
  options: ImageImportOptions = {},
): ImageImportResult {
  const { columns, rows } = getGridCounts(orientation, settings.density);
  const colorCount = options.colorCount ?? IMPORT_COLOR_COUNT;
  const mergeRegions = options.mergeRegions ?? true;

  const sampled = sampleImageGrid(image, columns, rows);
  const pixels = sampled.flat();

  const { centers, counts } = kMeans(pixels, colorCount);
  const palette = centers.map((center) =>
    rgbToHex(center.r, center.g, center.b),
  );

  const indexedGrid = sampled.map((line) =>
    line.map((pixel) => nearestPaletteIndex(pixel, centers)),
  );

  const blocks = mergeRegions
    ? buildBlocksFromIndexedGrid(indexedGrid, palette, settings)
    : blocksFromCells(indexedGrid, palette, settings);

  const dataUrl = imageToDataUrl(image);
  cacheSourceImage(dataUrl, image);

  return {
    colors: palette,
    colorAmounts: amountsFromCounts(counts),
    blocks,
    imageSource: {
      dataUrl,
      palette,
      paletteRgb: centers,
    },
  };
}

export async function importImageFileToMosaic(
  file: File,
  orientation: Orientation,
  settings: FrameSettings,
  options?: ImageImportOptions,
): Promise<ImageImportResult> {
  const image = await loadImageFromFile(file);
  return importImageToMosaic(image, orientation, settings, options);
}
