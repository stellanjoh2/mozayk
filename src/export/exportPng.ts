import { zipSync } from "fflate";
import { getExportSize, type ExportPreset } from "../config";
import { ensureCachedSourceImage } from "../import/imageSource";
import { renderMosaicToBlob } from "../render/renderFrame";
import { lockedColorsSet } from "../state/frameUtils";
import type { Frame, Orientation } from "../types";
import { downloadBlob } from "./downloadBlob";

function padFrameIndex(index: number): string {
  return String(index + 1).padStart(3, "0");
}

async function loadSourceImageForFrame(
  frame: Frame,
): Promise<HTMLImageElement | null> {
  if (!frame.settings.showSourceImage || !frame.imageSource) return null;
  try {
    return await ensureCachedSourceImage(frame.imageSource.dataUrl);
  } catch {
    return null;
  }
}

export async function exportCurrentFrame(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
): Promise<void> {
  const [width, height] = getExportSize(orientation, preset);
  const sourceImage = await loadSourceImageForFrame(frame);
  const blob = await renderMosaicToBlob({
    orientation,
    settings: frame.settings,
    blocks: frame.blocks,
    width,
    height,
    sourceImage,
  });
  if (!blob) throw new Error("PNG export failed");
  downloadBlob(blob, `mozayk_${padFrameIndex(0)}.png`);
}

export async function exportCurrentFrameTransparent(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
): Promise<void> {
  const [width, height] = getExportSize(orientation, preset);
  const sourceImage = await loadSourceImageForFrame(frame);
  const blob = await renderMosaicToBlob({
    orientation,
    settings: frame.settings,
    blocks: frame.blocks,
    width,
    height,
    sourceImage,
    omitColors: lockedColorsSet(frame.settings),
    transparentBackground: true,
  });
  if (!blob) throw new Error("PNG export failed");
  downloadBlob(blob, `mozayk_${padFrameIndex(0)}_transparent.png`);
}

export async function exportAllFrames(
  frames: Frame[],
  orientation: Orientation,
  preset: ExportPreset,
): Promise<void> {
  const [width, height] = getExportSize(orientation, preset);
  const files: Record<string, Uint8Array> = {};

  for (let i = 0; i < frames.length; i++) {
    const sourceImage = await loadSourceImageForFrame(frames[i]);
    const blob = await renderMosaicToBlob({
      orientation,
      settings: frames[i].settings,
      blocks: frames[i].blocks,
      width,
      height,
      sourceImage,
    });
    if (!blob) throw new Error("PNG export failed");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    files[`mozayk_${padFrameIndex(i)}.png`] = buffer;
  }

  const zipped = zipSync(files);
  downloadBlob(new Blob([zipped], { type: "application/zip" }), "mozayk_sequence.zip");
}
