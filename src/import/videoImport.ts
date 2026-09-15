import {
  MAX_FRAMES,
  closestGifFrameDelayCs,
  normalizePlaybackFps,
} from "../config";
import type { FrameSettings, Orientation } from "../types";
import {
  importImageToMosaicWithPalette,
  paletteFromImages,
  type ImageImportResult,
} from "./imageImport";

const VIDEO_CAPTURE_MAX_EDGE = 1920;
const SEEK_TIMEOUT_MS = 8000;
/** Fallback when container metadata has no usable frame rate. */
const FALLBACK_FPS = 24;

export type VideoProbe = {
  duration: number;
  width: number;
  height: number;
  orientation: Orientation;
  /** Source frame rate from the file (packets/sec). */
  fps: number;
  /** Estimated total frames in the clip. */
  sourceFrameCount: number;
  /** Frames Mozayk will import (capped at MAX_FRAMES). */
  importFrameCount: number;
};

export type VideoImportResult = {
  mosaics: ImageImportResult[];
  orientation: Orientation;
  playbackFps: number;
  durationS: number;
};

export type VideoImportOptions = {
  settings: FrameSettings;
  maxFrames?: number;
  /** When set, use these instead of re-probing inside the import. */
  probe?: VideoProbe;
  onProgress?: (label: string) => void;
};

export function orientationFromVideoSize(
  width: number,
  height: number,
): Orientation {
  if (width <= 0 || height <= 0) return "landscape";
  const aspect = width / height;
  // 16:9 ≈ 1.778, 1:1 = 1, 3:4 = 0.75, 9:16 = 0.5625
  if (aspect >= 1.25) return "landscape";
  if (aspect >= 0.875) return "square";
  if (aspect >= 0.65625) return "photo";
  return "portrait";
}

export function sourceFrameCount(durationS: number, fps: number): number {
  const duration = Math.max(0, durationS);
  const rate = Math.max(0, fps);
  if (duration <= 0 || rate <= 0) return 1;
  return Math.max(1, Math.round(duration * rate));
}

export function videoImportFrameCount(
  durationS: number,
  fps: number,
  maxFrames = MAX_FRAMES,
): number {
  return Math.min(maxFrames, sourceFrameCount(durationS, fps));
}

export function videoImportDurationS(
  durationS: number,
  fps: number,
  maxFrames = MAX_FRAMES,
): number {
  const duration = Math.max(0, durationS);
  const frames = videoImportFrameCount(duration, fps, maxFrames);
  const full = sourceFrameCount(duration, fps);
  if (frames >= full) return duration;
  return frames / Math.max(fps, 1);
}

/** First N frames at a constant source fps (not stretched across the whole clip). */
export function videoFrameTimestampsAtFps(
  frameCount: number,
  fps: number,
  durationS: number,
): number[] {
  if (frameCount <= 1) return [0];
  const last = Math.max(0, durationS - 0.001);
  const rate = Math.max(fps, 1);
  return Array.from({ length: frameCount }, (_, index) =>
    Math.min(index / rate, last),
  );
}

/** @deprecated Prefer videoFrameTimestampsAtFps for source-accurate import. */
export function videoFrameTimestamps(
  durationS: number,
  frameCount: number,
): number[] {
  if (frameCount <= 1) return [0];
  const last = Math.max(0, durationS - 0.001);
  return Array.from(
    { length: frameCount },
    (_, index) => (index / (frameCount - 1)) * last,
  );
}

export function videoPlaybackDelayCs(
  durationS: number,
  frameCount: number,
): number {
  if (frameCount <= 0) return closestGifFrameDelayCs(7);
  return closestGifFrameDelayCs((Math.max(0, durationS) * 100) / frameCount);
}

export function formatClipDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function formatClipFps(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return "? fps";
  const nearest = Math.round(fps);
  if (Math.abs(fps - nearest) < 0.05) return `${nearest} fps`;
  return `${fps.toFixed(2)} fps`;
}

function buildProbe(input: {
  duration: number;
  width: number;
  height: number;
  fps: number;
  maxFrames?: number;
}): VideoProbe {
  const duration = Math.max(0, input.duration);
  const fps = input.fps > 0 ? input.fps : FALLBACK_FPS;
  const maxFrames = input.maxFrames ?? MAX_FRAMES;
  const frames = sourceFrameCount(duration, fps);
  return {
    duration,
    width: input.width,
    height: input.height,
    orientation: orientationFromVideoSize(input.width, input.height),
    fps,
    sourceFrameCount: frames,
    importFrameCount: Math.min(maxFrames, frames),
  };
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function loadVideoElement(file: File): Promise<{
  video: HTMLVideoElement;
  objectUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");

    const cleanup = () => {
      video.onloadeddata = null;
      video.onerror = null;
    };

    video.onloadeddata = () => {
      cleanup();
      resolve({ video, objectUrl });
    };
    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load video"));
    };

    video.src = objectUrl;
    video.load();
  });
}

function disposeVideo(video: HTMLVideoElement, objectUrl: string): void {
  video.onloadeddata = null;
  video.onerror = null;
  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(objectUrl);
}

async function withVideoFile<T>(
  file: File,
  fn: (video: HTMLVideoElement) => Promise<T>,
): Promise<T> {
  const { video, objectUrl } = await loadVideoElement(file);
  try {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("This video has no duration");
    }
    if (video.videoWidth < 1 || video.videoHeight < 1) {
      throw new Error("This video has no picture");
    }
    return await fn(video);
  } finally {
    disposeVideo(video, objectUrl);
  }
}

async function probeWithMediabunny(file: File): Promise<VideoProbe | null> {
  try {
    const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    try {
      if (!(await input.canRead())) return null;
      const track = await input.getPrimaryVideoTrack();
      if (!track) return null;

      const durationFromTrack = await track.computeDuration();
      const durationFromMeta = await input.getDurationFromMetadata();
      const duration =
        durationFromTrack > 0
          ? durationFromTrack
          : durationFromMeta && durationFromMeta > 0
            ? durationFromMeta
            : 0;
      if (duration <= 0) return null;

      // Prefix scan is enough for fps; total frames come from duration × rate.
      const stats = await track.computePacketStats(Math.min(120, MAX_FRAMES));
      const fps =
        stats.averagePacketRate > 0 ? stats.averagePacketRate : FALLBACK_FPS;
      const width = await track.getDisplayWidth();
      const height = await track.getDisplayHeight();

      return buildProbe({ duration, width, height, fps });
    } finally {
      input.dispose();
    }
  } catch {
    return null;
  }
}

function probeFromVideo(video: HTMLVideoElement, fps = FALLBACK_FPS): VideoProbe {
  return buildProbe({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    fps,
  });
}

export async function probeVideoFile(file: File): Promise<VideoProbe> {
  const fromFile = await probeWithMediabunny(file);
  if (fromFile) return fromFile;
  return withVideoFile(file, async (video) => probeFromVideo(video));
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  const rvfc = (
    video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    }
  ).requestVideoFrameCallback;
  if (typeof rvfc !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 120);
    rvfc.call(video, () => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      void waitForVideoFrame(video).then(resolve);
    };
    if (Math.abs(video.currentTime - time) < 0.0005) {
      finish();
      return;
    }

    const timer = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Timed out seeking in video"));
    }, SEEK_TIMEOUT_MS);

    const onSeeked = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      finish();
    };
    const onError = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Could not seek in video"));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not capture video frame"));
    image.src = canvas.toDataURL("image/jpeg", 0.92);
  });
}

async function captureVideoFrame(
  video: HTMLVideoElement,
): Promise<HTMLImageElement> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(1, VIDEO_CAPTURE_MAX_EDGE / Math.max(vw, vh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToImage(canvas);
}

async function extractFrameImages(
  video: HTMLVideoElement,
  timestamps: number[],
  onProgress?: (label: string) => void,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  const total = timestamps.length;
  for (let i = 0; i < timestamps.length; i++) {
    await seekTo(video, timestamps[i]);
    images.push(await captureVideoFrame(video));
    onProgress?.(`Reading ${i + 1}/${total}…`);
    await nextPaint();
  }
  return images;
}

export async function importVideoFileToMosaic(
  file: File,
  options: VideoImportOptions,
): Promise<VideoImportResult> {
  const maxFrames = options.maxFrames ?? MAX_FRAMES;
  const probe =
    options.probe ??
    (await probeVideoFile(file).catch(() => null)) ??
    undefined;

  return withVideoFile(file, async (video) => {
    const resolved =
      probe ??
      probeFromVideo(video, FALLBACK_FPS);
    const frameCount = Math.min(maxFrames, resolved.importFrameCount);
    const timestamps = videoFrameTimestampsAtFps(
      frameCount,
      resolved.fps,
      resolved.duration,
    );
    const settings = { ...options.settings, fillAmount: 100 };

    const images = await extractFrameImages(
      video,
      timestamps,
      options.onProgress,
    );
    const palette = paletteFromImages(images, resolved.orientation, settings);
    const mosaics: ImageImportResult[] = [];
    for (let i = 0; i < images.length; i++) {
      mosaics.push(
        importImageToMosaicWithPalette(
          images[i],
          resolved.orientation,
          settings,
          palette,
        ),
      );
      options.onProgress?.(`Laying out ${i + 1}/${images.length}…`);
      await nextPaint();
    }

    const importDurationS = videoImportDurationS(
      resolved.duration,
      resolved.fps,
      maxFrames,
    );

    return {
      mosaics,
      orientation: resolved.orientation,
      playbackFps: normalizePlaybackFps(resolved.fps),
      durationS: importDurationS,
    };
  });
}
