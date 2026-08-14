import {
  blockFillRect,
  blockPixelRect,
  crossFillRects,
  getGridDimensions,
  gridEdge,
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
        const heavyOverlap =
          grid.cellSize >= 8 ? 2 : grid.cellSize >= 4 ? 1 : 0;
        assert(
          seamOverlapPx(grid) === 0,
          `default drawing has no overlap at ${width}×${height} d=${density}`,
        );
        assert(
          seamOverlapPx(grid, true) === heavyOverlap,
          `expected heavy overlap at ${width}×${height} d=${density}`,
        );

        let prevX = 0;
        for (let col = 0; col <= grid.columns; col++) {
          const x = gridEdge(col, grid.columns, width);
          assert(Number.isInteger(x), `grid edge X is integer col ${col}`);
          assert(x >= prevX, `grid edges are monotonic col ${col}`);
          prevX = x;
        }
        assert(gridEdge(0, grid.columns, width) === 0, "first X edge is 0");
        assert(
          gridEdge(grid.columns, grid.columns, width) === width,
          "last X edge is canvas width",
        );

        for (let col = 0; col < grid.columns; col++) {
          const left = blockPixelRect(grid, { col, row: 0, width: 1, height: 1 });
          const leftFill = blockFillRect(grid, { col, row: 0, width: 1, height: 1 });

          assert(left.x + left.width <= width, "snapped block exceeds canvas");
          assert(
            leftFill.x === left.x && leftFill.width === left.width,
            "default fill matches snapped geometry",
          );
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

            if (heavyOverlap > 0) {
              const leftHeavy = blockFillRect(
                grid,
                { col, row: 0, width: 1, height: 1 },
                true,
              );
              const rightHeavy = blockFillRect(
                grid,
                { col: col + 1, row: 0, width: 1, height: 1 },
                true,
              );
              assert(
                leftHeavy.x + leftHeavy.width > rightHeavy.x,
                `heavy fill rects must overlap col ${col} at ${width} d=${density}`,
              );
            }
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

        if (grid.columns >= 5 && grid.rows >= 5) {
          const big = blockPixelRect(grid, {
            col: 2,
            row: 3,
            width: 3,
            height: 2,
          });
          const tl = blockPixelRect(grid, {
            col: 2,
            row: 3,
            width: 1,
            height: 1,
          });
          const br = blockPixelRect(grid, {
            col: 4,
            row: 4,
            width: 1,
            height: 1,
          });
          assert(big.x === tl.x && big.y === tl.y, "span origin matches unit cell");
          assert(
            big.x + big.width === br.x + br.width,
            "span right edge matches last unit cell",
          );
          assert(
            big.y + big.height === br.y + br.height,
            "span bottom edge matches last unit cell",
          );

          const upper = blockPixelRect(grid, {
            col: 2,
            row: 1,
            width: 3,
            height: 1,
          });
          const lower = blockPixelRect(grid, {
            col: 2,
            row: 4,
            width: 3,
            height: 1,
          });
          assert(
            upper.x === lower.x && upper.width === lower.width,
            `same-column spans must share X at ${width} d=${density}: ${upper.x}+${upper.width} vs ${lower.x}+${lower.width}`,
          );
        }
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
  assert(seamOverlapPx(thumb) === 0, "thumbnails skip overlap");
  assert(seamOverlapPx(thumb, true) === 0, "thumbnails skip heavy overlap");
}

run();
console.log("gridMath seam tests passed");
