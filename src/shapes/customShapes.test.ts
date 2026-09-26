import {
  isSvgDataUrl,
  svgCustomShape,
  tintCustomShapeWithBlockColor,
} from "./customShapes";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(isSvgDataUrl("data:image/svg+xml;base64,abc"), "svg data url detected");
  assert(!isSvgDataUrl("data:image/png;base64,abc"), "png data url not svg");
  assert(tintCustomShapeWithBlockColor("contain"), "contain cutouts tint");
  assert(!tintCustomShapeWithBlockColor("cover"), "cover photos do not tint");

  const tinted = svgCustomShape(
    "data:image/svg+xml;base64,PHN2Zy4uLjwvY3ZnPg==",
    { x: 10, y: 20, width: 40, height: 40 },
    0,
    "cs0-0-1x1",
    "contain",
    "#00F5D4",
  );
  assert(tinted.includes('mask-type="alpha"'), "tinted svg uses alpha mask");
  assert(tinted.includes('fill="#00F5D4"'), "tinted svg uses block colour");
  assert(
    tinted.includes('mask="url(#cs0-0-1x1-mask)"'),
    "tinted svg references mask id",
  );
  assert(tinted.includes('<mask id="cs0-0-1x1-mask"'), "mask def is present");

  const photo = svgCustomShape(
    "data:image/png;base64,abc",
    { x: 0, y: 0, width: 20, height: 20 },
    0,
    undefined,
    "cover",
    "#ff0000",
  );
  assert(photo.startsWith("<image "), "opaque photo stays an image stamp");
  assert(!photo.includes("mask-type"), "opaque photo has no mask tint");

  console.log("customShapes tests passed");
}

run();
