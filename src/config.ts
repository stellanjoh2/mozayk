/** Soft-coded limits — expected to change later. */
export const MAX_FRAMES = 150;
export const MAX_COLORS = 8;
export const MAX_UNDO = 10;
/** Video import samples up to this many seconds (first N seconds if longer). */
export const MAX_VIDEO_DURATION_S = 5;
/** Default video import sample rate (shown pre-selected in the import dialog). */
export const VIDEO_IMPORT_FPS = 12;
export const VIDEO_IMPORT_FPS_OPTIONS = [
  { fps: 12, label: "12 fps", note: "Fast import" },
  { fps: 24, label: "24 fps", note: "Smooth" },
  { fps: 30, label: "30 fps", note: "Smoothest" },
] as const;
export type VideoImportFps = (typeof VIDEO_IMPORT_FPS_OPTIONS)[number]["fps"];

/** Exact fps for in-app playback and MP4 export. */
export const PLAYBACK_FPS_DEFAULT = 15;
export const PLAYBACK_FPS_OPTIONS = [30, 24, 15, 12, 10, 5, 2] as const;
export type PlaybackFps = (typeof PLAYBACK_FPS_OPTIONS)[number];

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

/** Portrait MP4 is fixed at 1080×1920 (9:16). */
export const MP4_PORTRAIT_EXPORT_SIZE: [number, number] = [1080, 1920];

const MP4_EXPORT_PRESET_ORDER: ExportPreset[] = ["1080p", "1440p", "2160p"];

export function getMp4ExportPresets(orientation: Orientation): ExportPreset[] {
  if (orientation === "portrait") return ["1080p"];
  return MP4_EXPORT_PRESET_ORDER;
}

export function clampMp4ExportPreset(
  orientation: Orientation,
  preset: ExportPreset,
): ExportPreset {
  if (orientation === "portrait") return "1080p";
  return preset;
}

export function getMp4ExportSize(
  orientation: Orientation,
  preset: ExportPreset,
): [number, number] {
  if (orientation === "portrait") return MP4_PORTRAIT_EXPORT_SIZE;
  return getExportSize(orientation, preset);
}

/** GIF export sizes — 16:9 that stay on the mosaic grid. */
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
  /** 18px cells at density 3; exact 16:9 near 480p. */
  "480p": {
    label: "480p",
    note: "recommended",
    landscape: [864, 486],
    portrait: [486, 864],
    square: [486, 486],
  },
  "720p": {
    label: "720p",
    note: "max",
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
  fps: number;
  label: string;
  note: string;
}[] = [
  { cs: 3, fps: 30, label: "0.03s", note: "~30 fps (GIF)" },
  { cs: 4, fps: 24, label: "0.04s", note: "24 fps" },
  { cs: 7, fps: 15, label: "0.07s", note: "15 fps" },
  { cs: 10, fps: 10, label: "0.10s", note: "10 fps" },
  { cs: 20, fps: 5, label: "0.20s", note: "5 fps" },
  { cs: 50, fps: 2, label: "0.50s", note: "2 fps" },
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

export function playbackDelayMs(fps: number): number {
  return 1000 / Math.max(fps, 1);
}

export function playbackDurationSeconds(frameCount: number, fps: number): number {
  return frameCount / Math.max(fps, 1);
}

export function normalizePlaybackFps(fps: number): PlaybackFps {
  if (!Number.isFinite(fps) || fps <= 0) return PLAYBACK_FPS_DEFAULT;
  let best: PlaybackFps = PLAYBACK_FPS_OPTIONS[0];
  let bestDiff = Math.abs(best - fps);
  for (const option of PLAYBACK_FPS_OPTIONS) {
    const diff = Math.abs(option - fps);
    if (diff < bestDiff) {
      best = option;
      bestDiff = diff;
    }
  }
  return best;
}

export function gifFrameDelayCsForPlaybackFps(fps: number): number {
  return closestGifFrameDelayCs(100 / fps);
}

export function clampGifFrameDelayCs(
  delayCs: number,
  frameCount: number,
): number {
  const maxForGiphy = Math.floor((GIPHY_DURATION_MAX_S * 100) / Math.max(1, frameCount));
  const max = Math.min(GIF_FRAME_DELAY_CS_MAX, Math.max(GIF_FRAME_DELAY_CS_MIN, maxForGiphy));
  return Math.min(max, Math.max(GIF_FRAME_DELAY_CS_MIN, delayCs));
}

export function closestGifFrameDelayCs(delayCs: number): number {
  let best = GIF_FRAME_DELAY_PRESETS[0].cs;
  let bestDiff = Math.abs(best - delayCs);
  for (const preset of GIF_FRAME_DELAY_PRESETS) {
    const diff = Math.abs(preset.cs - delayCs);
    if (diff < bestDiff) {
      best = preset.cs;
      bestDiff = diff;
    }
  }
  return best;
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
