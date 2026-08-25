import { applyLiveAction, createLiveFrame } from "./liveFrame";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  const frame = createLiveFrame();
  assert(frame.blocks.length > 0, "live frame has tiles");
  assert(frame.settings.shapes.sphere, "live frame enables spheres");
  assert(frame.settings.shapes.ring, "live frame enables rings");
  assert(frame.settings.invert !== true, "live frame starts uninverted");

  const inverted = applyLiveAction(frame, "invert");
  assert(inverted.settings.invert === true, "invert action sets invert");
  assert(inverted.blocks === frame.blocks, "invert keeps the layout");

  const shapes = applyLiveAction(inverted, "shapes");
  assert(shapes.settings.invert !== true, "shape hits clear invert");
  assert(shapes.blocks !== inverted.blocks, "shape hits rebuild the layout");

  const colours = applyLiveAction(shapes, "colours");
  assert(colours.blocks.length === shapes.blocks.length, "colour swap keeps tile count");

  const all = applyLiveAction(colours, "all");
  assert(all.settings.invert !== true, "all rebuilds without invert");
  assert(all.blocks.length > 0, "all still has tiles");
}

run();
console.log("live frame tests passed");
