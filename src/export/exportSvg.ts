import { getExportSize, type ExportPreset } from "../config";
import { downloadBlob } from "./downloadBlob";
import { renderMosaicToSvg } from "../render/renderSvg";
import type { Frame, Orientation } from "../types";

export function exportCurrentFrameSvg(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
): void {
  const [width, height] = getExportSize(orientation, preset);

  const svg = renderMosaicToSvg({
    orientation,
    settings: frame.settings,
    blocks: frame.blocks,
    width,
    height,
  });

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, "mosaik_001.svg");
}
