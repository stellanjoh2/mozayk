import {
  blockFillRect,
  blockPixelRect,
  crossFillRects,
  getGridDimensions,
  inscribedPixelSquare,
  seamOverlapPx,
} from "./gridMath";
import type { Density, Orientation } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const ORIENTATIONS: Orientation[] = ["landscape", "portrait", "square"];
const DENSITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const satisfies readonly Density[];
const CANVASES: Record<Orientation, [number, number][]> = {
  landscape: [
    [1920, 1080],
    [2400, 1350],
    [3840, 2160],
  ],
  portrait: [
    [1080, 1920],
    [1350, 2400],
    [2160, 3840],
  ],
  square: [
    [1080, 1080],
    [1350, 1350],
    [2160, 2160],
  ],
};

function run(): void {
  for (const orientation of ORIENTATIONS) {
    for (const density of DENSITIES) {
      for (const [width, height] of CANVASES[orientation]) {
        const grid = getGridDimensions(orientation, density, width, height);
        assert(seamOverlapPx(grid) === 1, `expected overlap at ${width}×${height} d=${density}`);

        for (let col = 0; col < grid.columns; col++) {
          const left = blockPixelRect(grid, { col, row: 0, width: 1, height: 1 });
          const leftFill = blockFillRect(grid, { col, row: 0, width: 1, height: 1 });

          assert(left.x + left.width <= width, "snapped block exceeds canvas");
          assert(leftFill.x >= 0 && leftFill.x + leftFill.width <= width, "fill exceeds canvas");
          assert(leftFill.y >= 0 && leftFill.y + leftFill.height <= height, "fill exceeds canvas");

          if (col + 1 < grid.columns) {
            const right = blockPixelRect(grid, {
              col: col + 1,
              row: 0,
              width: 1,
              height: 1,
            });
            assert(
              left.x + left.width === right.x,
              `gap/overlap in snapped edges col ${col} at ${width} d=${density}: ${left.x + left.width} vs ${right.x}`,
            );

            const rightFill = blockFillRect(grid, {
              col: col + 1,
              row: 0,
              width: 1,
              height: 1,
            });
            assert(
              leftFill.x + leftFill.width > rightFill.x,
              `fill rects must overlap col ${col} at ${width} d=${density}`,
            );
          }
        }

        const first = blockPixelRect(grid, { col: 0, row: 0, width: 1, height: 1 });
        const last = blockPixelRect(grid, {
          col: grid.columns - 1,
          row: grid.rows - 1,
          width: 1,
          height: 1,
        });
        assert(first.x === 0 && first.y === 0, "origin block should start at 0");
        assert(last.x + last.width === width, "last column should reach canvas width");
        assert(last.y + last.height === height, "last row should reach canvas height");
      }
    }
  }

  const oddRect = { x: 10, y: 20, width: 18, height: 17 };
  const square = inscribedPixelSquare(oddRect);
  assert(square.width === 17 && square.height === 17, "inscribed size is min side");
  assert(square.x === 10 && square.y === 20, "inscribed square stays on integer pixels");
  assert(Number.isInteger(square.x) && Number.isInteger(square.y), "square origin is integer");

  const { horizontal, vertical } = crossFillRects(oddRect, 0);
  assert(horizontal.width === square.width, "cross bar spans inscribed width");
  assert(vertical.height === square.height, "cross stem spans inscribed height");
  assert(
    horizontal.height === Math.max(1, Math.round(square.width / 3)),
    "cross arm thickness is ~1/3 of square",
  );

  const thumb = getGridDimensions("landscape", 3, 96, 54);
  assert(thumb.cellSize === 2, "thumbnail cell is 2px");
  assert(seamOverlapPx(thumb) === 0, "thumbnails skip 1px overlap");
}

run();
console.log("gridMath seam tests passed");
