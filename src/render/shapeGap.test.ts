import {
  insetCrossRects,
  insetPixelRect,
  shapeGapInsetPx,
} from "./shapeGap";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(shapeGapInsetPx(0, 40) === 0, "0 stays flush");
  assert(shapeGapInsetPx(undefined, 40) === 0, "omitted stays flush");
  assert(shapeGapInsetPx(-10, 40) === 0, "negative stays flush");
  assert(shapeGapInsetPx(100, 40) === 5, "100 is 12.5% of cell size");
  assert(shapeGapInsetPx(200, 40) === 5, "over 100 still caps at max");
  assert(shapeGapInsetPx(50, 40) === 2.5, "50 is half the max inset");

  const rect = { x: 10, y: 20, width: 40, height: 20 };
  const flush = insetPixelRect(rect, 0, 40);
  assert(flush.x === 10 && flush.width === 40, "0 keeps the same rect");

  const inset = insetPixelRect(rect, 100, 40);
  assert(inset.width === 30, "100 insets width by 5px per side");
  assert(inset.height === 10, "100 insets height by 5px per side");
  assert(inset.x === 15, "100 shifts x by inset");
  assert(inset.y === 25, "100 shifts y by inset");

  const wide = { x: 0, y: 0, width: 100, height: 50 };
  const wideInset = insetPixelRect(wide, 100, 50);
  assert(wideInset.x === 6.25, "wide block gets equal x inset");
  assert(wideInset.y === 6.25, "wide block gets equal y inset");
  assert(wideInset.width === 87.5, "wide block loses inset on both sides");
  assert(wideInset.height === 37.5, "wide block height inset matches x inset");

  const h = { x: 0, y: 10, width: 30, height: 10 };
  const v = { x: 10, y: 0, width: 10, height: 30 };
  const cross = insetCrossRects(h, v, 100, 40);
  assert(cross.horizontal.width === 20, "cross bar width insets per side");
  assert(cross.vertical.height === 20, "cross stem height insets per side");
  assert(cross.horizontal.x === 5, "cross bar shifts by inset");
  assert(cross.vertical.x === 15, "cross stem shifts by inset");
}

run();
console.log("shape gap tests passed");
