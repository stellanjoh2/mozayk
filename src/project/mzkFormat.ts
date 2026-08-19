import {
  clampGifFrameDelayCs,
  clampMp4ExportPreset,
  gifFpsFromDelayCs,
  normalizePlaybackFps,
  PLAYBACK_FPS_DEFAULT,
  type ExportPreset,
  type GifExportPreset,
  MAX_FRAMES,
} from "../config";
import type { ImageRgb, ImageSourceData } from "../import/imageSource";
import { parseBlocks, parseSettingsRecord } from "../state/settingsClipboard";
import {
  isOrientation,
  type BackgroundImageData,
  type Frame,
  type Orientation,
  type TextureOverlayData,
} from "../types";

export const MZK_EXTENSION = ".mzk";
export const MZK_MIME = "application/x-mozayk-project";

export type MzkProject = {
  orientation: Orientation;
  frames: Frame[];
  activeIndex: number;
  exportPreset: ExportPreset;
  mp4Preset: ExportPreset;
  gifPreset: GifExportPreset;
  gifFrameDelayCs: number;
  playbackFps: number;
};

export type MzkProjectPayload = {
  v: 1;
  mozayk: "project";
  orientation: Orientation;
  frames: Frame[];
  activeIndex: number;
  exportPreset?: ExportPreset;
  mp4Preset?: ExportPreset;
  gifPreset?: GifExportPreset;
  gifFrameDelayCs?: number;
  playbackFps?: number;
};

function isExportPreset(value: unknown): value is ExportPreset {
  return value === "1080p" || value === "1440p" || value === "2160p";
}

function isGifExportPreset(value: unknown): value is GifExportPreset {
  return value === "480p" || value === "720p";
}

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function fallbackFrameId(): string {
  return `frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseImageSource(value: unknown): ImageSourceData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!isDataUrl(record.dataUrl)) return undefined;

  const palette = Array.isArray(record.palette)
    ? record.palette.filter((item): item is string => typeof item === "string")
    : [];

  const paletteRgb: ImageRgb[] = [];
  if (Array.isArray(record.paletteRgb)) {
    for (const item of record.paletteRgb) {
      if (!item || typeof item !== "object") continue;
      const rgb = item as Record<string, unknown>;
      const r = Number(rgb.r);
      const g = Number(rgb.g);
      const b = Number(rgb.b);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        continue;
      }
      paletteRgb.push({ r, g, b });
    }
  }

  return { dataUrl: record.dataUrl, palette, paletteRgb };
}

function parseTextureOverlay(value: unknown): TextureOverlayData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const dataUrl = (value as Record<string, unknown>).dataUrl;
  if (!isDataUrl(dataUrl)) return undefined;
  return { dataUrl };
}

function parseBackgroundImage(value: unknown): BackgroundImageData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!isDataUrl(record.dataUrl)) return undefined;
  const name =
    typeof record.name === "string" && record.name.length > 0
      ? record.name
      : "Background";
  return { dataUrl: record.dataUrl, name };
}

function parseFrame(value: unknown): Frame | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!record.settings || typeof record.settings !== "object") return null;

  const settings = parseSettingsRecord(
    record.settings as Record<string, unknown>,
  );
  if (!settings) return null;

  const blocks =
    Array.isArray(record.blocks) && record.blocks.length === 0
      ? []
      : parseBlocks(record.blocks);
  if (!blocks) return null;

  const id =
    typeof record.id === "string" && record.id.length > 0
      ? record.id
      : fallbackFrameId();

  return {
    id,
    settings,
    blocks,
    imageSource: parseImageSource(record.imageSource),
    textureOverlay: parseTextureOverlay(record.textureOverlay),
    backgroundImage: parseBackgroundImage(record.backgroundImage),
  };
}

export function isMzkFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(MZK_EXTENSION);
}

export function serializeMzkProject(project: MzkProject): string {
  const payload: MzkProjectPayload = {
    v: 1,
    mozayk: "project",
    orientation: project.orientation,
    frames: project.frames.map(cloneFrameForSave),
    activeIndex: project.activeIndex,
    exportPreset: project.exportPreset,
    mp4Preset: project.mp4Preset,
    gifPreset: project.gifPreset,
    gifFrameDelayCs: project.gifFrameDelayCs,
    playbackFps: project.playbackFps,
  };
  return JSON.stringify(payload);
}

function cloneFrameForSave(frame: Frame): Frame {
  return {
    id: frame.id,
    settings: structuredClone(frame.settings),
    blocks: frame.blocks.map((block) => ({ ...block })),
    imageSource: frame.imageSource
      ? structuredClone(frame.imageSource)
      : undefined,
    textureOverlay: frame.textureOverlay
      ? structuredClone(frame.textureOverlay)
      : undefined,
    backgroundImage: frame.backgroundImage
      ? structuredClone(frame.backgroundImage)
      : undefined,
  };
}

export function parseMzkProject(raw: string): MzkProject | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    if (record.mozayk !== "project" || record.v !== 1) return null;
    if (!isOrientation(record.orientation)) return null;
    if (!Array.isArray(record.frames) || record.frames.length === 0) return null;

    const frames: Frame[] = [];
    for (const item of record.frames.slice(0, MAX_FRAMES)) {
      const frame = parseFrame(item);
      if (!frame) return null;
      frames.push(frame);
    }

    const activeIndex = Math.min(
      Math.max(0, Math.round(Number(record.activeIndex) || 0)),
      frames.length - 1,
    );

    const exportPreset = isExportPreset(record.exportPreset)
      ? record.exportPreset
      : "1080p";
    const mp4Preset = clampMp4ExportPreset(
      record.orientation,
      isExportPreset(record.mp4Preset) ? record.mp4Preset : exportPreset,
    );
    const gifPreset = isGifExportPreset(record.gifPreset)
      ? record.gifPreset
      : "480p";
    const gifFrameDelayCs = clampGifFrameDelayCs(
      Number(record.gifFrameDelayCs) || 7,
      frames.length,
    );
    const playbackFps = normalizePlaybackFps(
      Number(record.playbackFps) ||
        gifFpsFromDelayCs(gifFrameDelayCs) ||
        PLAYBACK_FPS_DEFAULT,
    );

    return {
      orientation: record.orientation,
      frames,
      activeIndex,
      exportPreset,
      mp4Preset,
      gifPreset,
      gifFrameDelayCs,
      playbackFps,
    };
  } catch {
    return null;
  }
}

export function readMzkFile(file: File): Promise<MzkProject> {
  if (!isMzkFile(file)) {
    return Promise.reject(new Error("Only .mzk project files can be loaded."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      if (typeof raw !== "string") {
        reject(new Error("Could not read project file."));
        return;
      }
      const project = parseMzkProject(raw);
      if (!project) {
        reject(new Error("This .mzk file is invalid or corrupted."));
        return;
      }
      resolve(project);
    };
    reader.onerror = () => reject(new Error("Could not read project file."));
    reader.readAsText(file);
  });
}

export function defaultMzkFileName(): string {
  return `mozayk${MZK_EXTENSION}`;
}
