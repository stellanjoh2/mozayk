import { getGridDimensions } from "../grid/gridMath";
import type { GridDimensions } from "../types";
import {
  gridCrossesPathData,
  gridOverlayPathData,
  overlayPxScale,
  scaledOverlayLineWidth,
} from "./gridOverlay";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function firstCrossArmSpan(d: string): number {
  const match = /^M ([\d.]+) ([\d.]+) H ([\d.]+)/.exec(d);
  assert(Boolean(match), "cross path starts with a horizontal arm");
  return Number(match![3]) - Number(match![1]);
}

function run(): void {
  const grid: GridDimensions = {
    columns: 8,
    rows: 5,
    width: 800,
    height: 500,
    cellSize: 100,
  };

  const a = gridOverlayPathData(grid, 55, 1);
  const b = gridOverlayPathData(grid, 55, 2);
  const same = gridOverlayPathData(grid, 55, 1);

  assert(a !== b, "different instance seeds produce different overlay paths");
  assert(a === same, "same instance seed is deterministic");

  assert(overlayPxScale(1920, 1080) === 1, "1080p landscape is 1×");
  assert(overlayPxScale(1080, 1920) === 1, "1080p portrait is 1×");
  assert(overlayPxScale(3840, 2160) === 2, "2160p landscape is 2×");
  assert(overlayPxScale(2400, 1350) === 1350 / 1080, "1440p scales by short edge");
  assert(scaledOverlayLineWidth(2, 3840, 2160) === 4, "2px stroke is 4px at 2160p");

  const grid1080 = getGridDimensions("landscape", 1, 1920, 1080);
  const grid2160 = getGridDimensions("landscape", 1, 3840, 2160);
  const span1080 = firstCrossArmSpan(gridCrossesPathData(grid1080, 0, 24));
  const span2160 = firstCrossArmSpan(gridCrossesPathData(grid2160, 0, 24));

  assert(span1080 === 24, "cross size is native at 1080p");
  assert(span2160 === 48, "cross size doubles at 2160p so it matches 1080p export");
}

run();
console.log("gridOverlay seed tests passed");
