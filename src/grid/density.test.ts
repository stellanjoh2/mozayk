import type { Density } from "../types";
import {
  DENSITIES,
  canDoubleDensity,
  canHalveDensity,
  gridScale,
  migrateProjectDensity,
  stepDensity,
  toggleDoubleGrid,
} from "./density";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  const scales: Record<Density, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    8: 8,
    10: 10,
    12: 12,
  };
  for (const density of DENSITIES) {
    assert(gridScale(density) === scales[density], `scale of ${density}`);
  }

  assert(stepDensity(0, -1) === 0, "OFF does not step down");
  assert(stepDensity(0, 1) === 1, "OFF steps up to 1");
  assert(stepDensity(1, -1) === 0, "density 1 steps down to OFF");
  assert(stepDensity(1, 1) === 2, "density 1 steps up to 2");
  assert(stepDensity(6, 1) === 8, "6 steps to 8");
  assert(stepDensity(12, 1) === 12, "density 12 does not step up");

  assert(!canDoubleDensity(0) && !canHalveDensity(0), "OFF does not double or halve");
  assert(canDoubleDensity(1) && toggleDoubleGrid(1) === 2, "1 doubles to 2");
  assert(canDoubleDensity(2) && toggleDoubleGrid(2) === 4, "2 doubles to 4");
  assert(canHalveDensity(2), "2 can also halve to 1");
  assert(canDoubleDensity(3) && toggleDoubleGrid(3) === 6, "3 doubles to 6");
  assert(!canHalveDensity(3), "3 does not halve");

  assert(migrateProjectDensity(1, 1) === 1, "v1 density 1 stays 1");
  assert(migrateProjectDensity(5, 1) === 5, "v1 density 5 stays 5");
  assert(migrateProjectDensity(1, 2) === 1, "v2 half-grid 1 becomes square 1");
  assert(migrateProjectDensity(2, 2) === 1, "v2 density 2 → 1");
  assert(migrateProjectDensity(7, 2) === 6, "v2 density 7 → 6");
  assert(migrateProjectDensity(8, 2) === 8, "v2 density 8 stays 8");
  assert(migrateProjectDensity(2, 3) === 2, "v3 density is stored as-is");
}

run();
console.log("density.test.ts: all passed");
