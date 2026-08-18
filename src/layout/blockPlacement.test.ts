import {
  canMoveBlock,
  findDropTargets,
  hitTestBlock,
  moveBlock,
  slotMatchesTarget,
  buildDropZoneLoops,
} from "./blockPlacement";
import type { MosaicBlock } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const blocks: MosaicBlock[] = [
  { col: 0, row: 0, width: 2, height: 2, shape: "block", color: "#ff0000" },
  { col: 2, row: 0, width: 1, height: 1, shape: "block", color: "#00ff00" },
  { col: 3, row: 0, width: 1, height: 1, shape: "block", color: "#0000ff" },
];

function run(): void {
  assert(hitTestBlock(blocks, 0, 0) === 0, "top-left of 2×2 block");
  assert(hitTestBlock(blocks, 1, 1) === 0, "inside 2×2 block");
  assert(hitTestBlock(blocks, 2, 0) === 1, "1×1 block");
  assert(hitTestBlock(blocks, 4, 0) === null, "empty cell");

  const targets = findDropTargets(blocks, 0, 6, 4);
  assert(targets.length > 0, "2×2 block has drop targets on sparse grid");
  assert(
    !targets.some((t) => t.col === 0 && t.row === 0),
    "current position excluded",
  );

  assert(canMoveBlock(blocks, 0, 2, 2, 6, 4), "valid move to empty 2×2 slot");
  assert(!canMoveBlock(blocks, 0, 2, 0, 6, 4), "cannot overlap other block");
  assert(!canMoveBlock(blocks, 0, 0, 0, 6, 4), "same position rejected");

  const moved = moveBlock(blocks, 0, 3, 2);
  assert(moved[0].col === 3 && moved[0].row === 2, "block moved");
  assert(moved[1].col === 2, "other blocks unchanged");

  assert(
    slotMatchesTarget({ col: 2, row: 2 }, 2, 2, 2, 2),
    "slot anchor matches",
  );
  assert(
    !slotMatchesTarget({ col: 2, row: 2 }, 1, 2, 2, 2),
    "outside slot rejected",
  );

  const loops = buildDropZoneLoops(
    [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ],
    { width: 2, height: 2 },
  );
  assert(loops.length === 1, "horizontal drop band merges to one loop");
  assert(loops[0].length >= 4, "loop traces the outer boundary");

  console.log("blockPlacement.test.ts: all passed");
}

run();
