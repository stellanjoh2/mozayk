import {
  gifDelayMs,
  GIPHY_FILE_SIZE_MAX,
  GIPHY_FILE_SIZE_RECOMMENDED,
  getGifExportSize,
  type GifExportPreset,
} from "../config";
import { renderMosaic } from "../render/renderFrame";
import type { Frame, Orientation } from "../types";
import { downloadBlob, mosaicFrameFileName } from "./downloadBlob";
import {
  loadSourceImageForFrame,
  loadTextureOverlayForFrame,
} from "./exportPng";

/** gifski quality 1–100. High enough for blur and photo overlays. */
const GIF_QUALITY = 90;

function formatGifBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function gifExportToast(bytes: number): string {
  const size = formatGifBytes(bytes);
  if (bytes > GIPHY_FILE_SIZE_MAX) {
    return `Exported ${size} GIF — over GIPHY’s 100 MB limit`;
  }
  if (bytes > GIPHY_FILE_SIZE_RECOMMENDED) {
    return `Exported ${size} GIF — GIPHY recommends 8 MB or less`;
  }
  return `Exported ${size} GIF`;
}

export async function exportGif(
  frames: Frame[],
  orientation: Orientation,
  preset: GifExportPreset,
  delayCs: number,
): Promise<number> {
  const [width, height] = getGifExportSize(orientation, preset);
  const canvas = document.createElement("canvas");
  const images: ImageData[] = [];

  for (const frame of frames) {
    const [sourceImage, textureOverlayImage] = await Promise.all([
      loadSourceImageForFrame(frame),
      loadTextureOverlayForFrame(frame),
    ]);
    renderMosaic(canvas, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width,
      height,
      sourceImage,
      textureOverlayImage,
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("GIF export failed");
    images.push(ctx.getImageData(0, 0, width, height));
  }

  if (images.length === 0) throw new Error("GIF export failed");

  // gifski needs at least two frames; duplicate a still so a one-frame timeline still encodes.
  const encodeFrames = images.length === 1 ? [images[0], images[0]] : images;
  const delay = gifDelayMs(delayCs);
  const { default: encode } = await import("gifski-wasm");
  const bytes = await encode({
    frames: encodeFrames,
    width,
    height,
    frameDurations: encodeFrames.map(() => delay),
    quality: GIF_QUALITY,
  });

  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  downloadBlob(new Blob([payload], { type: "image/gif" }), mosaicFrameFileName(0, "gif"));
  return payload.byteLength;
}
