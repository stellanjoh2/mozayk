import { resolveTextureOverlayHue } from "./textureOverlay";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(resolveTextureOverlayHue(undefined) === 0, "omitted hue is 0");
  assert(resolveTextureOverlayHue(40) === 40, "in-range hue passes through");
  assert(resolveTextureOverlayHue(-180) === -180, "min hue is kept");
  assert(resolveTextureOverlayHue(180) === 180, "max hue is kept");
  assert(resolveTextureOverlayHue(200) === 180, "over-max hue is clamped");
  assert(resolveTextureOverlayHue(-200) === -180, "under-min hue is clamped");
  assert(resolveTextureOverlayHue("nope") === 0, "invalid hue falls back to 0");
}

run();
console.log("textureOverlay tests passed");
