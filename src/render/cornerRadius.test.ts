import { blockCornerRadiusPx } from "./cornerRadius";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(blockCornerRadiusPx(40, 20, 0) === 0, "0 stays sharp");
  assert(blockCornerRadiusPx(40, 20, undefined) === 0, "omitted stays sharp");
  assert(blockCornerRadiusPx(40, 20, -10) === 0, "negative clamps to sharp");
  assert(blockCornerRadiusPx(40, 20, 100) === 10, "100 is a pill on the short side");
  assert(blockCornerRadiusPx(20, 40, 100) === 10, "100 pills a tall box");
  assert(blockCornerRadiusPx(40, 40, 100) === 20, "100 turns a square into a circle");
  assert(blockCornerRadiusPx(40, 20, 50) === 5, "50 is half way to a pill");
  assert(blockCornerRadiusPx(40, 20, 200) === 10, "over 100 still caps at pill");
  assert(blockCornerRadiusPx(0, 20, 100) === 0, "empty width stays 0");
}

run();
console.log("corner radius tests passed");
