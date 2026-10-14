import { reducePalette } from "./reducePalette";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const black = { r: 0, g: 0, b: 0 };
const nearBlack = { r: 20, g: 20, b: 20 };
const gold = { r: 190, g: 170, b: 100 };
const beige = { r: 200, g: 185, b: 150 };
const red = { r: 220, g: 20, b: 30 };
const colors = [black, nearBlack, gold, beige, red];
const weights = [40, 5, 30, 10, 15];

const full = reducePalette(colors, weights, 5);
assert(
  full.representatives.join() === "0,1,2,3,4",
  "full count keeps every colour",
);

const three = reducePalette(colors, weights, 3);
assert(
  three.representatives.join() === "0,2,4",
  `closest colours merge into heaviest member, got ${three.representatives.join()}`,
);
assert(three.weights.join() === "45,40,15", "merged weights add up");

const again = reducePalette(colors, weights, 3);
assert(
  again.representatives.join() === three.representatives.join(),
  "reduction is deterministic",
);

const two = reducePalette(colors, weights, 2);
assert(
  two.representatives.every((rep) => three.representatives.includes(rep)),
  "fewer colours nest inside the previous step",
);

console.log("reducePalette tests passed");
