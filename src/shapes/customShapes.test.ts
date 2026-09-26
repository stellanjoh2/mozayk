import assert from "node:assert/strict";
import {
  isSvgDataUrl,
  svgCustomShape,
  tintCustomShapeWithBlockColor,
} from "./customShapes";

assert.equal(isSvgDataUrl("data:image/svg+xml;base64,abc"), true);
assert.equal(isSvgDataUrl("data:image/png;base64,abc"), false);
assert.equal(tintCustomShapeWithBlockColor("contain"), true);
assert.equal(tintCustomShapeWithBlockColor("cover"), false);

const tinted = svgCustomShape(
  "data:image/svg+xml;base64,PHN2Zy4uLjwvY3ZnPg==",
  { x: 10, y: 20, width: 40, height: 40 },
  0,
  "cs0-0-1x1",
  "contain",
  "#00F5D4",
);
assert.match(tinted, /mask-type="alpha"/);
assert.match(tinted, /fill="#00F5D4"/);
assert.match(tinted, /mask="url\(#cs0-0-1x1-mask\)"/);
assert.match(tinted, /<mask id="cs0-0-1x1-mask"/);

const photo = svgCustomShape(
  "data:image/png;base64,abc",
  { x: 0, y: 0, width: 20, height: 20 },
  0,
  undefined,
  "cover",
  "#ff0000",
);
assert.match(photo, /^<image /);
assert.doesNotMatch(photo, /mask-type/);

console.log("customShapes tests passed");
