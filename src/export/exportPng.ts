import { zipSync } from "fflate";
import {
  EXPORT_PRESETS,
  type ExportPreset,
} from "../config";
import { renderMosaicToBlob } from "../render/renderFrame";
import type { Frame, Orientation } from "../types";
import { downloadBlob } from "./downloadBlob";

function padFrameIndex(index: number): string {
  return String(index + 1).padStart(3, "0");
}

export async function exportCurrentFrame(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
): Promise<void> {
  const [width, height] =
    orientation === "landscape"
      ? EXPORT_PRESETS[preset].landscape
      : EXPORT_PRESETS[preset].portrait;
  const blob = await renderMosaicToBlob({
    orientation,
    settings: frame.settings,
    blocks: frame.blocks,
    width,
    height,
  });
  if (!blob) return;
  downloadBlob(blob, `mosaik_${padFrameIndex(0)}.png`);
}

export async function exportAllFrames(
  frames: Frame[],
  orientation: Orientation,
  preset: ExportPreset,
): Promise<void> {
  const [width, height] =
    orientation === "landscape"
      ? EXPORT_PRESETS[preset].landscape
      : EXPORT_PRESETS[preset].portrait;
  const files: Record<string, Uint8Array> = {};

  for (let i = 0; i < frames.length; i++) {
    const blob = await renderMosaicToBlob({
      orientation,
      settings: frames[i].settings,
      blocks: frames[i].blocks,
      width,
      height,
    });
    if (!blob) continue;
    const buffer = new Uint8Array(await blob.arrayBuffer());
    files[`mosaik_${padFrameIndex(i)}.png`] = buffer;
  }

  const zipped = zipSync(files);
  downloadBlob(new Blob([zipped], { type: "application/zip" }), "mosaik_sequence.zip");
}
