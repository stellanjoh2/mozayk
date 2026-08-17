import { gridBlurWorkingSize, MAX_BLUR_EDGE } from "./gridBlur";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  const native = gridBlurWorkingSize(1920, 1080);
  assert(native.width === 1920 && native.height === 1080, "1080p stays native");

  const fourK = gridBlurWorkingSize(3840, 2160);
  assert(fourK.width === MAX_BLUR_EDGE, "4K landscape long edge is capped");
  assert(fourK.height === 1080, "4K landscape downscales to 1080p");

  const portrait = gridBlurWorkingSize(2160, 3840);
  assert(portrait.height === MAX_BLUR_EDGE, "4K portrait long edge is capped");
  assert(portrait.width === 1080, "4K portrait downscales to 1080p");

  const square = gridBlurWorkingSize(2160, 2160);
  assert(square.width === MAX_BLUR_EDGE, "4K square is capped");
  assert(square.height === MAX_BLUR_EDGE, "4K square stays square");

  const quadHd = gridBlurWorkingSize(2400, 1350);
  assert(quadHd.width === 1920 && quadHd.height === 1080, "1440p keeps 16:9");
}

run();
console.log("gridBlur tests passed");
