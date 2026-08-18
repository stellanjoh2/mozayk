import { gridOverlayPathData } from "./gridOverlay";
import type { GridDimensions } from "../types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
}

run();
console.log("gridOverlay seed tests passed");
