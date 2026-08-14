import { getExportSize, type ExportPreset } from "../config";
import { downloadBlob, mosaicFrameFileName } from "./downloadBlob";
import { renderMosaicToSvg } from "../render/renderSvg";
import { lockedColorsSet } from "../state/frameUtils";
import type { Frame, Orientation } from "../types";

export function exportCurrentFrameSvg(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
  frameIndex: number,
): void {
  const [width, height] = getExportSize(orientation, preset);

  const svg = renderMosaicToSvg({
    orientation,
    settings: frame.settings,
    blocks: frame.blocks,
    width,
    height,
    omitColors: lockedColorsSet(frame.settings),
    sourceDataUrl:
      frame.settings.showSourceImage && frame.imageSource
        ? frame.imageSource.dataUrl
        : undefined,
  });

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, mosaicFrameFileName(frameIndex, "svg"));
}
