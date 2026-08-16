import {
  gifDelayMs,
  gifFpsFromDelayCs,
  getExportSize,
  type ExportPreset,
} from "../config";
import { renderMosaic } from "../render/renderFrame";
import type { Frame, Orientation } from "../types";
import { downloadBlob } from "./downloadBlob";
import {
  loadBackgroundImageForFrame,
  loadSourceImageForFrame,
  loadTextureOverlayForFrame,
} from "./exportPng";

function formatMp4Bytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mp4ExportToast(bytes: number): string {
  return `Exported ${formatMp4Bytes(bytes)} MP4`;
}

export async function exportMp4(
  frames: Frame[],
  orientation: Orientation,
  preset: ExportPreset,
  delayCs: number,
  onProgress?: (label: string) => void,
): Promise<number> {
  if (frames.length === 0) throw new Error("MP4 export failed");

  onProgress?.("Exporting…");

  const {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    Quality,
    canEncodeVideo,
  } = await import("mediabunny");

  onProgress?.("Preparing…");

  if (!(await canEncodeVideo("avc"))) {
    throw new Error(
      "MP4 export requires H.264 encoding (WebCodecs) in this browser",
    );
  }

  const [width, height] = getExportSize(orientation, preset);
  const fps = gifFpsFromDelayCs(delayCs);
  const frameDurationS = gifDelayMs(delayCs) / 1000;
  const total = frames.length;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: new Quality("high"),
    keyFrameInterval: frameDurationS,
  });

  output.addVideoTrack(videoSource, { frameRate: fps });
  await output.start();

  for (let i = 0; i < total; i++) {
    onProgress?.(`Rendering ${i + 1}/${total}…`);
    const frame = frames[i];
    const [sourceImage, backgroundImage, textureOverlayImage] = await Promise.all([
      loadSourceImageForFrame(frame),
      loadBackgroundImageForFrame(frame),
      loadTextureOverlayForFrame(frame),
    ]);
    renderMosaic(canvas, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width,
      height,
      sourceImage,
      backgroundImage,
      textureOverlayImage,
    });
    await videoSource.add(i * frameDurationS, frameDurationS);
  }

  onProgress?.("Encoding…");
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("MP4 export failed");

  downloadBlob(new Blob([buffer], { type: "video/mp4" }), "mozayk.mp4");
  return buffer.byteLength;
}
