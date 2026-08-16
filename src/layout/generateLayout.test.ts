import { randomizeColors } from "./generateLayout";
import type { MosaicBlock } from "../types";

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

function tiles(count: number, color = "#ff0000"): MosaicBlock[] {
  return Array.from({ length: count }, (_, i) => ({
    col: i,
    row: 0,
    width: 1,
    height: 1,
    shape: "block" as const,
    color,
  }));
}

function run(): void {
  const palette = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
  const amounts = [25, 25, 25, 25];

  for (let seed = 1; seed <= 40; seed++) {
    const next = randomizeColors(
      tiles(4),
      palette,
      amounts,
      mulberry32(seed),
    );
    const unique = new Set(next.map((block) => block.color));
    assert(
      unique.size === 4,
      `equal amounts on 4 tiles must use all 4 colours (seed ${seed} got ${unique.size})`,
    );
  }

  const locked = randomizeColors(
    [
      { col: 0, row: 0, width: 1, height: 1, shape: "block", color: "#ff0000" },
      { col: 1, row: 0, width: 1, height: 1, shape: "block", color: "#00ff00" },
      { col: 2, row: 0, width: 1, height: 1, shape: "block", color: "#0000ff" },
      { col: 3, row: 0, width: 1, height: 1, shape: "block", color: "#ffff00" },
    ],
    palette,
    amounts,
    mulberry32(7),
    [true, false, false, false],
  );
  assert(locked[0].color === "#ff0000", "locked colour stays on its tiles");
  assert(
    locked.filter((block) => block.color === "#ff0000").length === 1,
    "locked colour is not copied onto unlocked tiles",
  );
  assert(
    new Set(locked.map((block) => block.color)).size === 4,
    "unlocked colours still fill the remaining tiles",
  );

  const a = randomizeColors(tiles(8), palette, amounts, mulberry32(1));
  const b = randomizeColors(tiles(8), palette, amounts, mulberry32(2));
  assert(
    a.some((block, i) => block.color !== b[i].color),
    "different rng seeds must rearrange colours",
  );
}

run();
console.log("randomizeColors tests passed");
