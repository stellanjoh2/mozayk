import {
  canMoveBlock,
  findDropTargets,
  hitTestBlock,
  moveBlock,
  pickDropTarget,
  relocateBlock,
  slotMatchesTarget,
  swapPartnerIndex,
  buildDropZoneLoops,
  type GridSlot,
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

  const overlapping: GridSlot[] = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
  ];
  assert(
    pickDropTarget(overlapping, 1, 0, 2, 2)?.col === 1,
    "overlap picks nearest origin, not first match",
  );
  assert(
    pickDropTarget(overlapping, 2, 0, 2, 2)?.col === 2,
    "right edge of merged band lands on right slot",
  );
  assert(
    pickDropTarget(overlapping, 0, 0, 2, 2)?.col === 0,
    "left edge still lands on left slot",
  );
  assert(
    pickDropTarget(overlapping, 1, 1, 2, 2)?.col === 1,
    "bottom of overlap still prefers the nearer origin",
  );
  assert(
    pickDropTarget(overlapping, 2, 0, 2, 2, 1, 0)?.col === 1,
    "grab offset keeps the grabbed cell under the cursor",
  );
  assert(
    pickDropTarget(overlapping, 4, 0, 2, 2) == null,
    "cursor outside every slot is not a drop",
  );

  const packed: MosaicBlock[] = [
    { col: 0, row: 0, width: 1, height: 1, shape: "block", color: "#111111" },
    { col: 1, row: 0, width: 1, height: 1, shape: "block", color: "#222222" },
    { col: 0, row: 1, width: 1, height: 1, shape: "block", color: "#333333" },
    { col: 1, row: 1, width: 1, height: 1, shape: "block", color: "#444444" },
  ];
  const packedTargets = findDropTargets(packed, 0, 2, 2);
  assert(packedTargets.length === 3, "packed same-size pieces are swap targets");
  assert(
    packedTargets.some((t) => t.col === 1 && t.row === 1),
    "opposite packed cell is a swap target",
  );
  assert(
    canMoveBlock(packed, 0, 1, 1, 2, 2),
    "swap onto another 1×1 is allowed",
  );
  assert(swapPartnerIndex(packed, 0, 1, 1) === 3, "swap partner is the 1×1 at 1,1");

  const swapped = relocateBlock(packed, 0, 1, 1);
  assert(swapped[0].col === 1 && swapped[0].row === 1, "moved piece takes the slot");
  assert(swapped[3].col === 0 && swapped[3].row === 0, "partner takes the old slot");
  assert(swapped[1].col === 1 && swapped[1].row === 0, "other pieces stay put");

  const uniquePacked: MosaicBlock[] = [
    { col: 0, row: 0, width: 2, height: 2, shape: "block", color: "#aaaaaa" },
    { col: 2, row: 0, width: 1, height: 1, shape: "block", color: "#bbbbbb" },
    { col: 3, row: 0, width: 1, height: 1, shape: "block", color: "#cccccc" },
    { col: 2, row: 1, width: 1, height: 1, shape: "block", color: "#dddddd" },
    { col: 3, row: 1, width: 1, height: 1, shape: "block", color: "#eeeeee" },
  ];
  assert(
    findDropTargets(uniquePacked, 0, 4, 2).length === 0,
    "unique size on a packed board has nowhere to go",
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
