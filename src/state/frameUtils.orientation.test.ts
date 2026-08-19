import { getGridCounts } from "../grid/gridMath";
import { rasterizeBlockColorGrid } from "../import/imageImport";
import type { Frame, MosaicBlock } from "../types";
import { createDefaultSettings, relayoutFrameToOrientation } from "./frameUtils";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const YELLOW = "#ffff00";
const PINK = "#ff00ff";
const CYAN = "#00ffff";

function stripedLandscapeFrame(imported: boolean): Frame {
  const blocks: MosaicBlock[] = [
    { col: 0, row: 0, width: 4, height: 9, color: YELLOW, shape: "sphere" },
    { col: 4, row: 0, width: 8, height: 9, color: PINK, shape: "sphere" },
    { col: 12, row: 0, width: 4, height: 9, color: CYAN, shape: "sphere" },
  ];
  const settings = {
    ...createDefaultSettings(),
    density: 1 as const,
    colors: [YELLOW, PINK, CYAN],
    colorAmounts: [34, 33, 33],
    scaleBlend: 0,
    fillAmount: 100,
    layoutSource: imported ? ("imported" as const) : ("procedural" as const),
  };
  return {
    id: imported ? "imported" : "procedural",
    settings,
    blocks,
    imageSource: imported
      ? {
          dataUrl: "data:image/png;base64,test",
          palette: [YELLOW, PINK, CYAN],
          paletteRgb: [
            { r: 255, g: 255, b: 0 },
            { r: 255, g: 0, b: 255 },
            { r: 0, g: 255, b: 255 },
          ],
        }
      : undefined,
  };
}

function run(): void {
  const imported = stripedLandscapeFrame(true);
  const square = relayoutFrameToOrientation(
    imported,
    "landscape",
    "square",
    mulberry32(1),
  );
  const { columns, rows } = getGridCounts("square", 1);
  assert(columns === 9 && rows === 9, "square grid is 9×9 at density 1");
  assert(
    square.settings.colors.join() === imported.settings.colors.join(),
    "palette stays put when the canvas ratio changes",
  );

  const grid = rasterizeBlockColorGrid(
    square.blocks,
    columns,
    rows,
    "#000000",
  );
  assert(grid[4][4] === PINK, "1:1 centre keeps the 16:9 centre colour");
  const used = new Set(grid.flat());
  assert(!used.has(YELLOW), "1:1 cover-crop drops the yellow sides");
  assert(
    [...used].every((color) => color === PINK || color === CYAN || color === "#000000"),
    "1:1 does not reshuffle in a new palette",
  );

  const procedural = stripedLandscapeFrame(false);
  const proceduralSquare = relayoutFrameToOrientation(
    procedural,
    "landscape",
    "square",
    mulberry32(2),
  );
  const proceduralGrid = rasterizeBlockColorGrid(
    proceduralSquare.blocks,
    columns,
    rows,
    "#000000",
  );
  assert(
    proceduralGrid[4][4] === PINK,
    "procedural 16:9 to 1:1 also keeps the centre colour",
  );
  assert(
    proceduralSquare.blocks.some(
      (block) =>
        block.color === PINK &&
        block.col === 0 &&
        block.width === 8 &&
        block.height === 9,
    ),
    "1:1 is a crop of the 16:9 tiles, not a remesh",
  );

  const GRAY = "#4b4b4b";
  const sparseLandscape: Frame = {
    id: "sparse",
    settings: {
      ...createDefaultSettings(),
      density: 5,
      fillAmount: 1,
      background: "#000000",
      colors: [GRAY, "#ff0000"],
      colorAmounts: [50, 50],
      maxWidth: 40,
      maxHeight: 23,
      randomWidth: true,
      randomHeight: true,
    },
    blocks: [
      { col: 36, row: 0, width: 4, height: 23, color: GRAY, shape: "block" },
      { col: 20, row: 2, width: 4, height: 16, color: GRAY, shape: "block" },
      { col: 0, row: 10, width: 12, height: 4, color: GRAY, shape: "block" },
      { col: 67, row: 10, width: 11, height: 4, color: GRAY, shape: "block" },
    ],
  };
  const sparseSquare = relayoutFrameToOrientation(
    sparseLandscape,
    "landscape",
    "square",
    mulberry32(11),
  );
  const squareCounts = getGridCounts("square", 5);
  const sparseGrid = rasterizeBlockColorGrid(
    sparseSquare.blocks,
    squareCounts.columns,
    squareCounts.rows,
    "#000000",
  );
  const occupied = sparseGrid.flat().filter((color) => color === GRAY).length;
  const cells = squareCounts.columns * squareCounts.rows;
  assert(
    occupied > 40,
    "sparse 16:9 to 1:1 keeps the cropped mosaic, not a single pixel",
  );
  assert(
    occupied < cells * 0.5,
    "sparse 16:9 to 1:1 keeps empty cells empty",
  );
  assert(
    sparseSquare.blocks.some(
      (block) =>
        block.color === GRAY &&
        block.col === 18 &&
        block.row === 0 &&
        block.width === 4 &&
        block.height === 23,
    ),
    "1:1 keeps the 16:9 centre bar as the same tile",
  );
  assert(
    sparseSquare.blocks.length === 2,
    "1:1 drops tiles that sit outside the crop",
  );

  const portrait = relayoutFrameToOrientation(
    procedural,
    "landscape",
    "portrait",
    mulberry32(3),
  );
  assert(portrait.blocks[0]?.col === 0, "landscape to portrait transposes");
  assert(portrait.blocks[0]?.row === 0, "transpose keeps the origin block");
  assert(portrait.blocks[0]?.color === YELLOW, "transpose keeps block colours");

  const back = relayoutFrameToOrientation(
    square,
    "square",
    "landscape",
    mulberry32(4),
  );
  const landscapeCounts = getGridCounts("landscape", 1);
  const backGrid = rasterizeBlockColorGrid(
    back.blocks,
    landscapeCounts.columns,
    landscapeCounts.rows,
    "#000000",
  );
  assert(backGrid[0][0] === YELLOW, "returning to 16:9 restores the cropped sides");
  assert(backGrid[4][8] === PINK, "returning to 16:9 restores the centre");

  const squareAgain = relayoutFrameToOrientation(
    relayoutFrameToOrientation(square, "square", "portrait", mulberry32(5)),
    "portrait",
    "square",
    mulberry32(6),
  );
  const gridAgain = rasterizeBlockColorGrid(
    squareAgain.blocks,
    columns,
    rows,
    "#000000",
  );
  assert(gridAgain[4][4] === grid[4][4], "revisiting 1:1 does not crop further");
  assert(!gridAgain.flat().includes(YELLOW), "revisiting 1:1 still drops the sides");

  const viaSquare = relayoutFrameToOrientation(
    relayoutFrameToOrientation(procedural, "landscape", "square", mulberry32(7)),
    "square",
    "portrait",
    mulberry32(8),
  );
  assert(
    viaSquare.blocks[0]?.color === YELLOW,
    "1:1 detour still transposes from the original 16:9",
  );
  assert(
    JSON.stringify(viaSquare.blocks) === JSON.stringify(portrait.blocks),
    "16:9 → 1:1 → 9:16 matches a direct 16:9 → 9:16 transpose",
  );

  const importedPortrait = relayoutFrameToOrientation(
    imported,
    "landscape",
    "portrait",
    mulberry32(9),
  );
  const importedBack = relayoutFrameToOrientation(
    importedPortrait,
    "portrait",
    "landscape",
    mulberry32(10),
  );
  const importedBackGrid = rasterizeBlockColorGrid(
    importedBack.blocks,
    landscapeCounts.columns,
    landscapeCounts.rows,
    "#000000",
  );
  assert(
    importedBackGrid[0][0] === YELLOW,
    "imported 16:9 → 9:16 → 16:9 restores the original sides",
  );

  const photo = relayoutFrameToOrientation(
    imported,
    "landscape",
    "photo",
    mulberry32(12),
  );
  const photoCounts = getGridCounts("photo", 1);
  assert(
    photoCounts.columns === 9 && photoCounts.rows === 12,
    "photo grid is 9×12 at density 1",
  );
  const photoGrid = rasterizeBlockColorGrid(
    photo.blocks,
    photoCounts.columns,
    photoCounts.rows,
    "#000000",
  );
  assert(!photoGrid.flat().includes(YELLOW), "3:4 cover-crop drops the yellow sides");
  assert(photoGrid[6][4] === PINK, "3:4 centre keeps the 16:9 centre colour");

  const photoBack = relayoutFrameToOrientation(
    photo,
    "photo",
    "landscape",
    mulberry32(13),
  );
  const photoBackGrid = rasterizeBlockColorGrid(
    photoBack.blocks,
    landscapeCounts.columns,
    landscapeCounts.rows,
    "#000000",
  );
  assert(
    photoBackGrid[0][0] === YELLOW,
    "16:9 → 3:4 → 16:9 restores the original sides",
  );
}

run();
console.log("frameUtils orientation tests passed");
