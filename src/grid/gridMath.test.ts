import { DENSITIES } from "./density";
import {
  blockPixelRect,
  crossFillRects,
  getGridDimensions,
  getThumbnailRenderSize,
  getThumbnailSize,
  gridEdge,
  inscribedPixelSquare,
  triangleFillPoints,
} from "./gridMath";
import type { Orientation } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const ORIENTATIONS: Orientation[] = ["landscape", "portrait", "square"];
const CANVASES: Record<Orientation, [number, number][]> = {
  landscape: [
    [864, 486],
    [1280, 720],
    [1920, 1080],
    [2400, 1350],
    [3840, 2160],
  ],
  portrait: [
    [486, 864],
    [720, 1280],
    [1080, 1920],
    [1350, 2400],
    [2160, 3840],
  ],
  square: [
    [486, 486],
    [720, 720],
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

          assert(left.x + left.width <= width, "snapped block exceeds canvas");
          assert(left.x >= 0 && left.y >= 0, "block origin in bounds");

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

  // Non-square snapped rects — triangles stay isosceles (no stretch).
  const skewed = { x: 100, y: 200, width: 13, height: 14 };
  const square = inscribedPixelSquare(skewed);
  assert(square.width === 13 && square.height === 13, "inscribed square uses min side");
  assert(square.x === skewed.x && square.y === skewed.y + 0, "inscribed square is centred with floor");

  const tri = triangleFillPoints(skewed);
  assert(tri[0][0] === square.x && tri[0][1] === square.y, "triangle top-left is square origin");
  assert(
    tri[1][0] === square.x + square.width && tri[1][1] === square.y,
    "triangle top-right stays on square",
  );
  assert(
    tri[2][0] === square.x + square.width &&
      tri[2][1] === square.y + square.height,
    "triangle is isosceles — not stretched to the tall cell",
  );

  // Crosses snap to grid cells — arm edges share neighbour grid lines.
  const crossGrid = getGridDimensions("landscape", 5, 1920, 1080);
  const tallCross = { col: 11, row: 4, width: 4, height: 17 };
  const { horizontal, vertical } = crossFillRects(crossGrid, tallCross);
  const squareOrigin = blockPixelRect(crossGrid, {
    col: 11,
    row: 4 + Math.floor((17 - 4) / 2),
    width: 4,
    height: 4,
  });
  assert(horizontal.x === squareOrigin.x, "cross bar left is inscribed square");
  assert(
    horizontal.x + horizontal.width === squareOrigin.x + squareOrigin.width,
    "cross bar spans inscribed width",
  );
  assert(vertical.y === squareOrigin.y, "cross stem top is inscribed square");
  assert(
    vertical.y + vertical.height === squareOrigin.y + squareOrigin.height,
    "cross stem spans inscribed height",
  );
  assert(horizontal.height === crossGrid.cellSize, "4-cell cross arm is 1 cell");
  assert(vertical.width === crossGrid.cellSize, "4-cell cross stem is 1 cell");
  assert(
    Number.isInteger(horizontal.y / crossGrid.cellSize),
    "cross bar sits on a row edge",
  );
  assert(
    Number.isInteger(vertical.x / crossGrid.cellSize),
    "cross stem sits on a column edge",
  );

  const three = crossFillRects(crossGrid, { col: 0, row: 0, width: 3, height: 3 });
  assert(three.horizontal.height === crossGrid.cellSize, "3-cell cross arm is 1 cell");
  assert(three.vertical.width === crossGrid.cellSize, "3-cell cross stem is 1 cell");
  assert(
    three.vertical.x === blockPixelRect(crossGrid, { col: 1, row: 0, width: 1, height: 1 }).x,
    "3-cell stem is centred on middle column",
  );

  const tall = { x: 0, y: 0, width: 20, height: 200 };
  const tallTri = triangleFillPoints(tall);
  const tallSize = tallTri[1][0] - tallTri[0][0];
  assert(tallSize === 20, "tall cell triangle uses short side only");
  assert(
    tallTri[2][1] - tallTri[0][1] === tallSize,
    "tall cell triangle is not stretched vertically",
  );

  const display = getThumbnailSize("landscape");
  assert(display[0] === 96 && display[1] === 54, "display thumb is 96×54");
  const render = getThumbnailRenderSize("landscape");
  assert(render[0] === 480 && render[1] === 270, "render thumb is 480×270");
  for (const orientation of ORIENTATIONS) {
    const [rw, rh] = getThumbnailRenderSize(orientation);
    for (const density of DENSITIES) {
      const grid = getGridDimensions(orientation, density, rw, rh);
      assert(
        grid.cellSize > 0,
        `render thumb ${rw}×${rh} is a valid mosaic at d=${density}`,
      );
    }
  }
}

run();
console.log("gridMath seam tests passed");
