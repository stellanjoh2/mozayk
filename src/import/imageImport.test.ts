import {
  gridExtentsFromBlocks,
  rasterizeBlockColorGrid,
  resampleColorGrid,
} from "./imageImport";
import type { MosaicBlock } from "../types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  const blocks: MosaicBlock[] = [
    { col: 0, row: 0, width: 2, height: 2, color: "#ffff00", shape: "block" },
    { col: 2, row: 0, width: 2, height: 2, color: "#ff00ff", shape: "block" },
    { col: 0, row: 2, width: 2, height: 2, color: "#ff00ff", shape: "block" },
    { col: 2, row: 2, width: 2, height: 2, color: "#ffff00", shape: "block" },
  ];

  assert(gridExtentsFromBlocks(blocks).columns === 4, "extent columns");
  assert(gridExtentsFromBlocks(blocks).rows === 4, "extent rows");

  const grid = rasterizeBlockColorGrid(blocks, 4, 4, "#000000");
  assert(grid[0][0] === "#ffff00", "raster top-left");
  assert(grid[0][3] === "#ff00ff", "raster top-right");

  const upscaled = resampleColorGrid(grid, 8, 8);
  assert(upscaled.length === 8 && upscaled[0].length === 8, "upscale size");
  assert(upscaled[1][1] === "#ffff00", "yellow region stays yellow");
  assert(upscaled[1][6] === "#ff00ff", "pink region stays pink");

  const downscaled = resampleColorGrid(upscaled, 4, 4);
  assert(downscaled[0][0] === "#ffff00", "downscale preserves yellow");
  assert(downscaled[0][3] === "#ff00ff", "downscale preserves pink");
}

run();
console.log("imageImport tests passed");
