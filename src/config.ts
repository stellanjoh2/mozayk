/** Soft-coded limits — expected to change later. */
export const MAX_FRAMES = 30;
export const MAX_COLORS = 8;
export const MAX_UNDO = 10;
export const DEFAULT_FPS = 12;

import type { Orientation } from "./types";

export const PREVIEW_WIDTH_LANDSCAPE = 1920;
export const PREVIEW_HEIGHT_LANDSCAPE = 1080;
export const PREVIEW_SIZE_SQUARE = 1080;

export type ExportPreset = "1080p" | "1440p" | "2160p";

export const EXPORT_PRESETS: Record<
  ExportPreset,
  {
    label: string;
    landscape: [number, number];
    portrait: [number, number];
    square: [number, number];
  }
> = {
  "1080p": {
    label: "1080p",
    landscape: [1920, 1080],
    portrait: [1080, 1920],
    square: [1080, 1080],
  },
  /** Valid perfect-square grid at all density levels (50px cells at k=3). */
  "1440p": {
    label: "1440p",
    landscape: [2400, 1350],
    portrait: [1350, 2400],
    square: [1350, 1350],
  },
  "2160p": {
    label: "2160p",
    landscape: [3840, 2160],
    portrait: [2160, 3840],
    square: [2160, 2160],
  },
};

export function getPreviewSize(orientation: Orientation): [number, number] {
  if (orientation === "landscape") {
    return [PREVIEW_WIDTH_LANDSCAPE, PREVIEW_HEIGHT_LANDSCAPE];
  }
  if (orientation === "portrait") {
    return [PREVIEW_HEIGHT_LANDSCAPE, PREVIEW_WIDTH_LANDSCAPE];
  }
  return [PREVIEW_SIZE_SQUARE, PREVIEW_SIZE_SQUARE];
}

export function getExportSize(
  orientation: Orientation,
  preset: ExportPreset,
): [number, number] {
  const sizes = EXPORT_PRESETS[preset];
  if (orientation === "landscape") return sizes.landscape;
  if (orientation === "portrait") return sizes.portrait;
  return sizes.square;
}

/** Prefer the smallest export preset that covers the on-screen fit box at device DPR. */
const PREVIEW_PRESET_ORDER: ExportPreset[] = ["1080p", "1440p", "2160p"];

export function getPreviewSizeForDisplay(
  orientation: Orientation,
  displayWidthCss: number,
  displayHeightCss: number,
  devicePixelRatio = 1,
): [number, number] {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  const needW = Math.max(0, displayWidthCss) * dpr;
  const needH = Math.max(0, displayHeightCss) * dpr;

  for (const preset of PREVIEW_PRESET_ORDER) {
    const size = getExportSize(orientation, preset);
    if (size[0] >= needW && size[1] >= needH) return size;
  }

  return getExportSize(orientation, "2160p");
}
