import { isValidHex, normalizeHex } from "../colorMath";
import { coverCropRect } from "../import/imageSource";
import type { FrameSettings, TextureOverlayBlendMode } from "../types";

export const TEXTURE_OVERLAY_BLEND_MODES = [
  "multiply",
  "overlay",
  "soft-light",
  "hard-light",
  "screen",
  "difference",
] as const satisfies readonly TextureOverlayBlendMode[];

export const TEXTURE_OVERLAY_BLEND_LABELS: Record<
  TextureOverlayBlendMode,
  string
> = {
  multiply: "Multiply",
  overlay: "Overlay",
  "soft-light": "Soft Light",
  "hard-light": "Hard Light",
  screen: "Screen",
  difference: "Difference",
};

export const TEXTURE_OVERLAY_OPACITY_DEFAULT = 40;
export const TEXTURE_OVERLAY_TINT_DEFAULT = "#ffffff";

/** Omitted flag keeps legacy behaviour: on whenever a texture is uploaded. */
export function isTextureOverlayEnabled(
  settings: FrameSettings,
  hasTexture: boolean,
): boolean {
  return settings.textureOverlayEnabled ?? hasTexture;
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function resolveTextureOverlayBlend(
  value: unknown,
): TextureOverlayBlendMode {
  if (
    typeof value === "string" &&
    TEXTURE_OVERLAY_BLEND_MODES.includes(value as TextureOverlayBlendMode)
  ) {
    return value as TextureOverlayBlendMode;
  }
  return "multiply";
}

function context2d(
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (canvas.width !== width || canvas.height !== height) return null;
  return canvas.getContext("2d");
}

function imageIntrinsicSize(image: HTMLImageElement): {
  width: number;
  height: number;
} {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function drawCoverNoClear(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const { width: imageWidth, height: imageHeight } = imageIntrinsicSize(image);
  if (imageWidth <= 0 || imageHeight <= 0) return;
  const { sx, sy, sw, sh } = coverCropRect(
    imageWidth,
    imageHeight,
    width,
    height,
  );
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

/** Build a cover-cropped, optionally tinted texture at target size. */
function prepareTextureLayer(
  image: HTMLImageElement,
  tint: string | null,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const ctx = context2d(width, height);
  if (!ctx) return null;

  drawCoverNoClear(ctx, image, width, height);

  if (tint && tint.toLowerCase() !== TEXTURE_OVERLAY_TINT_DEFAULT) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  return ctx.canvas;
}

/**
 * Full-frame texture overlay after mosaic FX, before colour-grade extras
 * (canvas / PNG only). Cover-crops like the source photo, then blends
 * with opacity + optional tint.
 */
export function applyTextureOverlay(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  settings: FrameSettings,
  width: number,
  height: number,
): void {
  if (!isTextureOverlayEnabled(settings, true)) return;

  const { width: imageWidth, height: imageHeight } = imageIntrinsicSize(image);
  if (imageWidth <= 0 || imageHeight <= 0) return;

  const opacity =
    clampInt(
      settings.textureOverlayOpacity,
      0,
      100,
      TEXTURE_OVERLAY_OPACITY_DEFAULT,
    ) / 100;
  if (opacity <= 0) return;

  const blend = resolveTextureOverlayBlend(settings.textureOverlayBlend);
  const rawTint = settings.textureOverlayTint;
  const tint =
    typeof rawTint === "string" && isValidHex(rawTint)
      ? normalizeHex(rawTint)
      : null;

  const layer = prepareTextureLayer(image, tint, width, height);
  if (!layer) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = blend;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
