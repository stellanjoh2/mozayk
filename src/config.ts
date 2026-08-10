/** Soft-coded limits — expected to change later. */
export const MAX_FRAMES = 30;
export const MAX_COLORS = 4;
export const DEFAULT_FPS = 12;

export const PREVIEW_WIDTH_LANDSCAPE = 1920;
export const PREVIEW_HEIGHT_LANDSCAPE = 1080;

export type ExportPreset = "1080p" | "1440p" | "2160p";

export const EXPORT_PRESETS: Record<
  ExportPreset,
  { label: string; landscape: [number, number]; portrait: [number, number] }
> = {
  "1080p": {
    label: "1080p",
    landscape: [1920, 1080],
    portrait: [1080, 1920],
  },
  /** Valid perfect-square grid at all density levels (50px cells at k=3). */
  "1440p": {
    label: "1440p",
    landscape: [2400, 1350],
    portrait: [1350, 2400],
  },
  "2160p": {
    label: "2160p",
    landscape: [3840, 2160],
    portrait: [2160, 3840],
  },
};
