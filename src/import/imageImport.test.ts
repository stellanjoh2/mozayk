import { hexToRgb } from "../colorMath";
import {
  colorsForImportIndexing,
  coverCropBlocks,
  coverCropColorGrid,
  gridExtentsFromBlocks,
  nearestPaletteIndex,
  rasterizeBlockColorGrid,
  resampleColorGrid,
  sameGridAspect,
} from "./imageImport";
import { coverCropRect } from "./imageSource";
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

  assert(sameGridAspect(96, 54, 48, 27), "landscape density scale keeps aspect");
  assert(sameGridAspect(54, 96, 27, 48), "portrait density scale keeps aspect");
  assert(sameGridAspect(54, 72, 27, 36), "photo density scale keeps aspect");
  assert(!sameGridAspect(96, 54, 54, 96), "landscape to portrait changes aspect");
  assert(!sameGridAspect(96, 54, 54, 54), "landscape to square changes aspect");
  assert(!sameGridAspect(54, 72, 54, 96), "photo to portrait changes aspect");
  assert(!sameGridAspect(0, 54, 96, 54), "empty extents are not the same aspect");

  const striped: string[][] = Array.from({ length: 9 }, () => [
    ...Array(4).fill("#ffff00"),
    ...Array(8).fill("#ff00ff"),
    ...Array(4).fill("#00ffff"),
  ]);
  const squareCrop = coverCropColorGrid(striped, 9, 9);
  assert(squareCrop.length === 9 && squareCrop[0].length === 9, "square crop size");
  assert(squareCrop[4][0] === "#ff00ff", "16:9 to 1:1 keeps the centre colour");
  assert(squareCrop[4][4] === "#ff00ff", "16:9 to 1:1 centre stays pink");
  assert(
    squareCrop.every((row) => row.every((cell) => cell !== "#ffff00")),
    "16:9 to 1:1 drops the cropped yellow sides",
  );

  const croppedTiles = coverCropBlocks(
    [
      { col: 0, row: 0, width: 4, height: 9, color: "#ffff00", shape: "block" },
      { col: 4, row: 0, width: 8, height: 9, color: "#ff00ff", shape: "block" },
      { col: 12, row: 0, width: 4, height: 9, color: "#00ffff", shape: "block" },
    ],
    16,
    9,
    9,
    9,
  );
  assert(croppedTiles.length === 2, "tile crop drops the yellow sides");
  assert(
    croppedTiles[0]?.color === "#ff00ff" &&
      croppedTiles[0]?.col === 0 &&
      croppedTiles[0]?.width === 8 &&
      croppedTiles[0]?.height === 9,
    "tile crop keeps the centre block intact",
  );

  const scaled = coverCropColorGrid(striped, 8, 4);
  const resampled = resampleColorGrid(striped, 8, 4);
  assert(
    scaled[0][0] === resampled[0][0] && scaled[3][7] === resampled[3][7],
    "same-ratio cover crop matches resample",
  );

  const portraitCrop = coverCropRect(1920, 1080, 9, 16);
  assert(portraitCrop.sh === 1080, "portrait recrop uses full source height");
  assert(portraitCrop.sw < 1920, "portrait recrop trims source width");
  assert(
    Math.abs(portraitCrop.sw / portraitCrop.sh - 9 / 16) < 0.001,
    "portrait recrop matches 9:16 instead of stretching",
  );

  const importRgb = [
    { r: 180, g: 120, b: 90 },
    { r: 20, g: 20, b: 20 },
    { r: 240, g: 240, b: 230 },
  ];
  const customPalette = ["#121212", "#090909", "#e2ff00"];
  const mapped = colorsForImportIndexing(customPalette, importRgb);
  const skinPixel = { r: 180, g: 120, b: 90 };
  const importSlot = nearestPaletteIndex(skinPixel, mapped.indexRgb);
  const customSlot = nearestPaletteIndex(
    skinPixel,
    customPalette.map((hex) => hexToRgb(hex)),
  );
  assert(importSlot === 0, "photo skin still maps to import slot 0");
  assert(mapped.colors[importSlot] === "#121212", "slot 0 keeps the custom colour");
  assert(
    customSlot !== importSlot,
    "matching the photo to custom hex RGB would pick the wrong slot",
  );

  const shorter = colorsForImportIndexing(["#111111", "#222222"], importRgb);
  assert(shorter.colors.length === 3, "import slots stay complete");
  assert(shorter.colors[2] === "#222222", "extra import slots clamp to last colour");
}

run();
console.log("imageImport tests passed");
