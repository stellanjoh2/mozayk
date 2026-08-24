import { formatCount, parseCount } from "./counts";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(parseCount(12) === 12, "integer count");
  assert(parseCount("1200") === 1200, "numeric string");
  assert(parseCount(-3) === 0, "negative is zero");
  assert(parseCount("nope") === 0, "NaN is zero");
  assert(parseCount(null) === 0, "null is zero");
  assert(formatCount(0) === "0", "zero formats");
  assert(formatCount(1280) === "1,280", "thousands separator");
  console.log("counts.test.ts: all passed");
}

run();
