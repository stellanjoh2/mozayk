import { randomizeLayoutSettings } from "./randomizeLayoutSettings";
import { createDefaultSettings } from "../state/frameUtils";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(): void {
  const base = {
    ...createDefaultSettings(),
    fillAmount: 50,
    gridOverlayChaos: 33,
    gridOverlaySeed: 111,
  };

  const next = randomizeLayoutSettings(base, "landscape", mulberry32(1));
  assert(next.fillAmount !== 50, "fill amount should be randomized");
  assert(next.gridOverlayChaos !== 33, "overlay chaos should be randomized");
  assert(next.gridOverlaySeed !== 111, "overlay seed should be randomized");
  assert(next.weight !== base.weight, "weight should be randomized");
}

run();
console.log("randomizeLayoutSettings tests passed");
