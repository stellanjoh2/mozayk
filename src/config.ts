/** Soft-coded limits — expected to change later. */
export const MAX_FRAMES = 30;
export const MAX_COLORS = 8;
export const MAX_UNDO = 10;

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

/** GIPHY upload guidance — 16:9 sizes that stay on the mosaic grid. */
export type GifExportPreset = "480p" | "720p";

export const GIF_EXPORT_PRESETS: Record<
  GifExportPreset,
  {
    label: string;
    note: string;
    landscape: [number, number];
    portrait: [number, number];
    square: [number, number];
  }
> = {
  /** 18px cells at density 3; exact 16:9 near GIPHY’s 480p recommendation. */
  "480p": {
    label: "480p",
    note: "GIPHY recommended",
    landscape: [864, 486],
    portrait: [486, 864],
    square: [486, 486],
  },
  "720p": {
    label: "720p",
    note: "GIPHY max",
    landscape: [1280, 720],
    portrait: [720, 1280],
    square: [720, 720],
  },
};

export const GIPHY_DURATION_RECOMMENDED_S = 6;
export const GIPHY_DURATION_MAX_S = 15;
export const GIPHY_FILE_SIZE_RECOMMENDED = 8 * 1024 * 1024;
export const GIPHY_FILE_SIZE_MAX = 100 * 1024 * 1024;

/** Discrete GIF holds in centiseconds. */
export const GIF_FRAME_DELAY_PRESETS: readonly {
  cs: number;
  label: string;
  note: string;
}[] = [
  { cs: 4, label: "0.04s", note: "24 fps" },
  { cs: 7, label: "0.07s", note: "15 fps · GIPHY" },
  { cs: 10, label: "0.10s", note: "10 fps" },
  { cs: 20, label: "0.20s", note: "5 fps" },
  { cs: 50, label: "0.50s", note: "2 fps" },
];

export const GIF_FRAME_DELAY_CS_DEFAULT = 7;
const GIF_FRAME_DELAY_CS_MIN = GIF_FRAME_DELAY_PRESETS[0].cs;
const GIF_FRAME_DELAY_CS_MAX =
  GIF_FRAME_DELAY_PRESETS[GIF_FRAME_DELAY_PRESETS.length - 1].cs;

export function getGifExportSize(
  orientation: Orientation,
  preset: GifExportPreset,
): [number, number] {
  const sizes = GIF_EXPORT_PRESETS[preset];
  if (orientation === "landscape") return sizes.landscape;
  if (orientation === "portrait") return sizes.portrait;
  return sizes.square;
}

export function gifDelayMs(delayCs: number): number {
  return delayCs * 10;
}

export function gifDurationSeconds(frameCount: number, delayCs: number): number {
  return (frameCount * delayCs) / 100;
}

export function gifFpsFromDelayCs(delayCs: number): number {
  return delayCs > 0 ? 100 / delayCs : 0;
}

export function clampGifFrameDelayCs(
  delayCs: number,
  frameCount: number,
): number {
  const maxForGiphy = Math.floor((GIPHY_DURATION_MAX_S * 100) / Math.max(1, frameCount));
  const max = Math.min(GIF_FRAME_DELAY_CS_MAX, Math.max(GIF_FRAME_DELAY_CS_MIN, maxForGiphy));
  return Math.min(max, Math.max(GIF_FRAME_DELAY_CS_MIN, delayCs));
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
