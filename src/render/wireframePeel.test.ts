import { wireframePeelStrokePx } from "./wireframePeel";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(
    wireframePeelStrokePx(1, 1920, 1080, 1) === 1,
    "1px at 1080p export is 1 canvas pixel",
  );
  assert(
    wireframePeelStrokePx(1, 3840, 2160, 1) === 2,
    "1px at 2160p export matches 1080p scale",
  );
  assert(
    wireframePeelStrokePx(1, 1920, 1080, 2) === 2,
    "1px on a half-size preview is 1 CSS pixel",
  );
  assert(
    wireframePeelStrokePx(2, 1920, 1080, 2.5) === 5,
    "2px preview stroke tracks CSS pixels",
  );
  assert(
    wireframePeelStrokePx(1, 1920, 1080, 2.4) === 2,
    "preview stroke snaps to a whole canvas pixel",
  );
  assert(
    wireframePeelStrokePx(1, 480, 270, 1) === 1,
    "thumbnail canvas still gets a whole pixel",
  );
}

run();
console.log("wireframePeel tests passed");
