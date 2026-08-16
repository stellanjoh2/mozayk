import {
  gifDelayMs,
  GIPHY_FILE_SIZE_MAX,
  GIPHY_FILE_SIZE_RECOMMENDED,
  getGifExportSize,
  getPreviewSize,
  type GifExportPreset,
} from "../config";
import { renderMosaic } from "../render/renderFrame";
import type { Frame, Orientation } from "../types";
import { downloadBlob, mosaicFrameFileName } from "./downloadBlob";
import {
  loadBackgroundImageForFrame,
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
    return `Exported ${size} GIF — over 100 MB`;
  }
  if (bytes > GIPHY_FILE_SIZE_RECOMMENDED) {
    return `Exported ${size} GIF — 8 MB or less recommended`;
  }
  return `Exported ${size} GIF`;
}

function downscaleFrame(
  source: HTMLCanvasElement,
  dest: HTMLCanvasElement,
  width: number,
  height: number,
): ImageData {
  dest.width = width;
  dest.height = height;
  const ctx = dest.getContext("2d");
  if (!ctx) throw new Error("GIF export failed");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function gifSourceSize(
  orientation: Orientation,
  workingSize?: readonly [number, number],
): [number, number] {
  const fallback = getPreviewSize(orientation);
  if (!workingSize) return fallback;
  const [width, height] = workingSize;
  if (!(width > 0 && height > 0)) return fallback;
  const [refW, refH] = fallback;
  if (Math.abs(width / height - refW / refH) > 0.001) return fallback;
  return [width, height];
}

export async function exportGif(
  frames: Frame[],
  orientation: Orientation,
  preset: GifExportPreset,
  delayCs: number,
  /** Backing size of the live preview — GIF is a 1:1 downscale of this canvas. */
  workingSize?: readonly [number, number],
): Promise<number> {
  const [width, height] = getGifExportSize(orientation, preset);
  const [renderWidth, renderHeight] = gifSourceSize(orientation, workingSize);
  const source = document.createElement("canvas");
  const dest = document.createElement("canvas");
  const images: ImageData[] = [];

  for (const frame of frames) {
    const [sourceImage, backgroundImage, textureOverlayImage] = await Promise.all([
      loadSourceImageForFrame(frame),
      loadBackgroundImageForFrame(frame),
      loadTextureOverlayForFrame(frame),
    ]);
    renderMosaic(source, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width: renderWidth,
      height: renderHeight,
      sourceImage,
      backgroundImage,
      textureOverlayImage,
    });
    images.push(downscaleFrame(source, dest, width, height));
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
