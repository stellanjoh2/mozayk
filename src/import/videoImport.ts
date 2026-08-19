import {
  MAX_FRAMES,
  MAX_VIDEO_DURATION_S,
  VIDEO_IMPORT_FPS,
  closestGifFrameDelayCs,
} from "../config";
import type { FrameSettings, Orientation } from "../types";
import {
  importImageToMosaicWithPalette,
  paletteFromImages,
  type ImageImportResult,
} from "./imageImport";

const VIDEO_CAPTURE_MAX_EDGE = 1920;
const SEEK_TIMEOUT_MS = 8000;

export type VideoProbe = {
  duration: number;
  width: number;
  height: number;
  orientation: Orientation;
};

export type VideoImportResult = {
  mosaics: ImageImportResult[];
  orientation: Orientation;
  playbackFps: number;
  durationS: number;
};

export type VideoImportOptions = {
  settings: FrameSettings;
  maxDurationS?: number;
  maxFrames?: number;
  targetFps?: number;
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

export function videoFrameCount(
  durationS: number,
  maxFrames = MAX_FRAMES,
  targetFps = VIDEO_IMPORT_FPS,
): number {
  const duration = Math.max(0, durationS);
  if (duration <= 0) return 1;
  return Math.max(1, Math.min(maxFrames, Math.round(duration * targetFps)));
}

export function videoImportMaxFrames(
  targetFps: number,
  maxDurationS = MAX_VIDEO_DURATION_S,
): number {
  return Math.max(1, Math.round(maxDurationS * targetFps));
}

export function videoImportFrameCount(
  durationS: number,
  targetFps: number,
  maxDurationS = MAX_VIDEO_DURATION_S,
): number {
  const importDurationS = Math.min(Math.max(0, durationS), maxDurationS);
  return videoFrameCount(
    importDurationS,
    videoImportMaxFrames(targetFps, maxDurationS),
    targetFps,
  );
}

export function videoImportDurationS(
  durationS: number,
  maxDurationS = MAX_VIDEO_DURATION_S,
): number {
  return Math.min(Math.max(0, durationS), maxDurationS);
}

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

function probeFromVideo(video: HTMLVideoElement): VideoProbe {
  return {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    orientation: orientationFromVideoSize(video.videoWidth, video.videoHeight),
  };
}

export async function probeVideoFile(file: File): Promise<VideoProbe> {
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
  const maxDurationS = options.maxDurationS ?? MAX_VIDEO_DURATION_S;
  const maxFrames = options.maxFrames ?? MAX_FRAMES;
  const targetFps = options.targetFps ?? VIDEO_IMPORT_FPS;

  return withVideoFile(file, async (video) => {
    const orientation = orientationFromVideoSize(
      video.videoWidth,
      video.videoHeight,
    );
    const durationS = Math.min(video.duration, maxDurationS);
    const frameCount = videoFrameCount(durationS, maxFrames, targetFps);
    const timestamps = videoFrameTimestamps(durationS, frameCount);
    const settings = { ...options.settings, fillAmount: 100 };

    const images = await extractFrameImages(
      video,
      timestamps,
      options.onProgress,
    );
    const palette = paletteFromImages(images, orientation, settings);
    const mosaics: ImageImportResult[] = [];
    for (let i = 0; i < images.length; i++) {
      mosaics.push(
        importImageToMosaicWithPalette(
          images[i],
          orientation,
          settings,
          palette,
        ),
      );
      options.onProgress?.(`Laying out ${i + 1}/${images.length}…`);
      await nextPaint();
    }

    return { mosaics, orientation, playbackFps: targetFps, durationS };
  });
}
