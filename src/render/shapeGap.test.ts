import { scaleCrossRects, scalePixelRect, shapeGapScale } from "./shapeGap";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(shapeGapScale(0) === 1, "0 stays flush");
  assert(shapeGapScale(undefined) === 1, "omitted stays flush");
  assert(shapeGapScale(-10) === 1, "negative stays flush");
  assert(shapeGapScale(100) === 0.75, "100 is 25% smaller");
  assert(shapeGapScale(200) === 0.75, "over 100 still caps at 25%");
  assert(shapeGapScale(50) === 0.875, "50 is half the max shrink");

  const rect = { x: 10, y: 20, width: 40, height: 20 };
  const flush = scalePixelRect(rect, 0);
  assert(flush.x === 10 && flush.width === 40, "0 keeps the same rect");

  const pill = scalePixelRect(rect, 100);
  assert(pill.width === 30, "100 shrinks width by 25%");
  assert(pill.height === 15, "100 shrinks height by 25%");
  assert(pill.x === 15, "100 insets x to stay centred");
  assert(pill.y === 22.5, "100 insets y to stay centred");

  const h = { x: 0, y: 10, width: 30, height: 10 };
  const v = { x: 10, y: 0, width: 10, height: 30 };
  const cross = scaleCrossRects(h, v, 100);
  assert(cross.horizontal.width === 22.5, "cross bar width scales");
  assert(cross.vertical.height === 22.5, "cross stem height scales");
  assert(cross.horizontal.x === 3.75, "cross shrinks around its centre");
  assert(cross.vertical.x === 11.25, "cross arms stay joined");
}

run();
console.log("shape gap tests passed");
