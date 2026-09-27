import {
  decodeSvgDataUrl,
  encodeSvgDataUrl,
  customShapeIconUsesAccentMask,
  isSvgDataUrl,
  svgCustomShape,
  tightSvgSizing,
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
  assert(
    customShapeIconUsesAccentMask({
      dataUrl: "data:image/svg+xml;base64,abc",
    }),
    "svg preview uses accent mask",
  );
  assert(
    customShapeIconUsesAccentMask({
      dataUrl: "data:image/png;base64,abc",
      fit: "contain",
    }),
    "contain cutout preview uses accent mask",
  );
  assert(
    !customShapeIconUsesAccentMask({
      dataUrl: "data:image/png;base64,abc",
      fit: "cover",
    }),
    "cover photo preview stays as pixels",
  );

  const square = tightSvgSizing({ x: 400, y: 400, width: 200, height: 200 });
  assert(square !== null, "square box sizes");
  assert(square.viewBox === "396 396 208 208", "viewBox crops to content + pad");
  assert(square.width === "512" && square.height === "512", "square intrinsic size");

  const wide = tightSvgSizing({ x: 0, y: 100, width: 400, height: 100 });
  assert(wide !== null, "wide box sizes");
  assert(wide.width === "512" && wide.height === "143", "wide mark keeps aspect");

  const round = tightSvgSizing({ x: 380, y: 380, width: 240, height: 240 });
  assert(round !== null, "circle-like box sizes");
  assert(round.viewBox === "375.2 375.2 249.6 249.6", "circle whitespace trimmed");
  assert(round.width === "512" && round.height === "512", "round mark is square");

  const sample = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/></svg>`;
  const encoded = encodeSvgDataUrl(sample);
  assert(encoded.startsWith("data:image/svg+xml;base64,"), "encodes base64 svg");
  const decoded = decodeSvgDataUrl(encoded);
  assert(decoded !== null && decoded.includes("viewBox="), "round-trips svg text");

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
