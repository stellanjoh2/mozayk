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
  const ctx = dest.getContext("2d", { willReadFrequently: true });
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
  // Live preview can be 4K on retina; gifski + blur at that size OOMs the tab.
  if (width * height > refW * refH) return fallback;
  return [width, height];
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

type GifskiWorkerResult =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; message: string };

function encodeGifFrames(
  frames: ImageData[],
  width: number,
  height: number,
  delay: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./gifskiEncoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    const buffers = frames.map((frame) => frame.data.buffer);
    worker.onmessage = (event: MessageEvent<GifskiWorkerResult>) => {
      worker.terminate();
      if (event.data.ok) {
        resolve(new Uint8Array(event.data.bytes));
        return;
      }
      reject(new Error(event.data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("GIF export failed"));
    };
    worker.postMessage(
      { frames: buffers, width, height, delay, quality: GIF_QUALITY },
      buffers,
    );
  });
}

export async function exportGif(
  frames: Frame[],
  orientation: Orientation,
  preset: GifExportPreset,
  delayCs: number,
  /** Live preview backing size. Capped at 1080p so 4K retina previews don't OOM. */
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
    await yieldToUi();
  }

  if (images.length === 0) throw new Error("GIF export failed");

  // gifski needs at least two frames; clone a still so the worker can transfer both buffers.
  const encodeFrames =
    images.length === 1
      ? [
          images[0],
          new ImageData(
            new Uint8ClampedArray(images[0].data),
            images[0].width,
            images[0].height,
          ),
        ]
      : images;
  const delay = gifDelayMs(delayCs);
  // gifski-lite auto-downscales past 800×600 unless resize is set.
  // 1280×720 hits factor 2 → 640×360; pin output to the chosen preset.
  // Encode off the main thread — wasm.encode is sync and freezes the tab at 720p.
  const bytes = await encodeGifFrames(encodeFrames, width, height, delay);

  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  downloadBlob(new Blob([payload], { type: "image/gif" }), mosaicFrameFileName(0, "gif"));
  return payload.byteLength;
}
