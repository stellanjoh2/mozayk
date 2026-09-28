import {
  IMAGE_FILL_SEQUENCE_MS,
  NEW_CANVAS_SEQUENCE_MS,
  SWEEP_START_MS,
  buildBlockCues,
  buildRadialFillBlockCues,
  gridFadeAlpha,
  parseRgb,
  sweepEdgeX,
  veilAlpha,
  wipeEdgeX,
  beamFadeAlpha,
} from "./newCanvasSequence";
import type { GridDimensions, MosaicBlock } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const grid: GridDimensions = {
  columns: 16,
  rows: 9,
  cellSize: 120,
  width: 1920,
  height: 1080,
};

function block(col: number, row: number): MosaicBlock {
  return { col, row, width: 1, height: 1, shape: "block", color: "#fff" };
}

function run(): void {
  assert(sweepEdgeX(0, grid.width) < 0, "sweep has not started at t=0");
  let previous = -1;
  for (let t = 0; t <= NEW_CANVAS_SEQUENCE_MS; t += 20) {
    const x = sweepEdgeX(t, grid.width);
    assert(x >= previous, `sweep edge never moves back (t=${t})`);
    assert(x <= grid.width, `sweep edge stays on canvas (t=${t})`);
    previous = x;
  }
  assert(
    sweepEdgeX(NEW_CANVAS_SEQUENCE_MS, grid.width) === grid.width,
    "sweep reaches the right edge",
  );

  const reach = grid.cellSize * 5.5;
  assert(wipeEdgeX(0, grid.width, reach) === 0, "nothing is wiped at t=0");
  let previousWipe = -1;
  let clearedBeforeLaser = false;
  for (let t = 0; t <= NEW_CANVAS_SEQUENCE_MS; t += 20) {
    const x = wipeEdgeX(t, grid.width, reach);
    assert(x >= previousWipe, `wipe front never moves back (t=${t})`);
    previousWipe = x;
    // The old canvas must be gone before the laser starts drawing.
    if (x >= grid.width + reach && !clearedBeforeLaser) {
      clearedBeforeLaser = sweepEdgeX(t, grid.width) < 0;
      assert(clearedBeforeLaser, `canvas clears before the laser (t=${t})`);
    }
  }
  assert(clearedBeforeLaser, "the wipe finishes within the sequence");

  assert(veilAlpha(0) === 1, "veil starts opaque");
  assert(veilAlpha(1000) === 1, "veil holds while blocks land");
  assert(veilAlpha(NEW_CANVAS_SEQUENCE_MS) === 0, "veil is gone at the end");
  assert(gridFadeAlpha(0) === 1, "grid starts at full strength");
  assert(
    gridFadeAlpha(NEW_CANVAS_SEQUENCE_MS) === 0,
    "grid is gone at the end",
  );
  assert(beamFadeAlpha(0) === 1, "laser wash is full before it enters");
  assert(
    beamFadeAlpha(SWEEP_START_MS) === 1,
    "laser wash is full at the moment it enters",
  );
  assert(
    beamFadeAlpha(1400) < beamFadeAlpha(SWEEP_START_MS),
    "laser wash fades as soon as it is on screen",
  );
  assert(beamFadeAlpha(NEW_CANVAS_SEQUENCE_MS) === 0, "laser wash is gone by the end");
  assert(
    beamFadeAlpha(2500) < beamFadeAlpha(2100),
    "laser wash keeps fading while blocks fill",
  );

  const cues = buildBlockCues(
    [block(0, 0), block(8, 4), block(15, 8)],
    grid,
  );
  assert(cues.length === 3, "one cue per block");
  assert(cues[0].startMs < cues[1].startMs, "wave runs west to east");
  assert(cues[1].startMs < cues[2].startMs, "wave keeps running east");
  assert(
    cues[2].startMs < NEW_CANVAS_SEQUENCE_MS,
    "the last block starts inside the sequence",
  );
  assert(cues[2].rect.x === 1800 && cues[2].rect.width === 120, "cue rects are grid cells");
  assert(buildBlockCues([block(0, 0)], { ...grid, width: 0 }).length === 0, "zero-width grid has no cues");

  const corner = block(0, 0);
  const center = block(8, 4);
  const farCorner = block(15, 8);
  const fillCues = buildRadialFillBlockCues([corner, center, farCorner], grid);
  assert(fillCues.length === 3, "fill has one cue per block");
  assert(
    fillCues[1].startMs < fillCues[0].startMs,
    "fill wave starts near the centre before a corner",
  );
  assert(
    fillCues[1].startMs < fillCues[2].startMs,
    "fill wave reaches the far corner after the centre",
  );
  assert(
    fillCues[0].startMs < IMAGE_FILL_SEQUENCE_MS &&
      fillCues[2].startMs < IMAGE_FILL_SEQUENCE_MS,
    "corner fill blocks start inside the fill sequence",
  );
  assert(
    IMAGE_FILL_SEQUENCE_MS < NEW_CANVAS_SEQUENCE_MS,
    "fill sequence is shorter than full new-canvas",
  );
  assert(
    buildRadialFillBlockCues([center], { ...grid, width: 0 }).length === 0,
    "zero-width grid has no radial cues",
  );

  const [r, g, b] = parseRgb("rgb(198, 240, 0)");
  assert(r === 198 && g === 240 && b === 0, "parses computed rgb()");
  const [fr] = parseRgb("not a colour", [1, 2, 3]);
  assert(fr === 1, "falls back on unparseable colours");
}

run();
console.log("newCanvasSequence tests passed");
