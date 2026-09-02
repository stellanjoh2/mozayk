import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
  VideoTexture,
} from "three";
import type { MediaKind } from "./types";
import { applyCoverFit, sampleEnergy } from "./fitTexture";

export function kindFromFile(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

export function kindFromSrc(src: string, fallback?: MediaKind): MediaKind {
  if (fallback) return fallback;
  const lower = src.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) return "video";
  if (lower.endsWith(".gif")) return "gif";
  return "image";
}

export type LoadedMedia = {
  texture: Texture;
  tick: ((dt: number) => void) | null;
  dispose: () => void;
  applyFit: (panelAspect: number) => void;
};

function prepare(texture: Texture, animated = false): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  if (animated) {
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
  } else {
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
  }
  texture.needsUpdate = true;
  return texture;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      video.play().catch(() => {});
      resolve(video);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", () => reject(new Error("Failed to load video")), {
      once: true,
    });
    video.load();
  });
}

function frameDelay(frame: ParsedFrame): number {
  return frame.delay < 20 ? 100 : frame.delay;
}

/** Canvas/WebGL only ever see one GIF frame; play decoded patches instead. */
async function loadGif(src: string): Promise<LoadedMedia> {
  const res = await fetch(src);
  if (!res.ok) throw new Error("Failed to load gif");
  const gif = parseGIF(await res.arrayBuffer());
  const frames = decompressFrames(gif, true).filter(
    (frame) => frame.patch && frame.dims.width > 0 && frame.dims.height > 0,
  );
  if (frames.length === 0) throw new Error("Empty gif");

  const width = Math.max(1, gif.lsd.width);
  const height = Math.max(1, gif.lsd.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context");
  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) throw new Error("No 2D context");

  let patchData: ImageData | null = null;
  let snapshot: ImageData | null = null;
  let pending: { type: number; x: number; y: number; w: number; h: number } | null =
    null;

  const drawPatch = (frame: ParsedFrame) => {
    const { left, top, width: w, height: h } = frame.dims;
    if (!patchData || patchData.width !== w || patchData.height !== h) {
      scratch.width = w;
      scratch.height = h;
      patchData = scratchCtx.createImageData(w, h);
    }
    patchData.data.set(frame.patch);
    scratchCtx.putImageData(patchData, 0, 0);
    ctx.drawImage(scratch, left, top);
  };

  const paint = (frame: ParsedFrame) => {
    if (pending) {
      if (pending.type === 2) {
        ctx.clearRect(pending.x, pending.y, pending.w, pending.h);
      } else if (pending.type === 3 && snapshot) {
        ctx.putImageData(snapshot, 0, 0);
      }
      pending = null;
    }
    if (frame.disposalType === 3) {
      snapshot = ctx.getImageData(0, 0, width, height);
    }
    drawPatch(frame);
    if (frame.disposalType === 2 || frame.disposalType === 3) {
      pending = {
        type: frame.disposalType,
        x: frame.dims.left,
        y: frame.dims.top,
        w: frame.dims.width,
        h: frame.dims.height,
      };
    }
  };

  const reset = () => {
    ctx.clearRect(0, 0, width, height);
    snapshot = null;
    pending = null;
  };

  paint(frames[0]);
  const texture = prepare(new CanvasTexture(canvas));
  const applyFit = makeFit(texture, canvas, width / height);
  const dispose = () => texture.dispose();

  if (frames.length === 1) {
    return { texture, tick: null, dispose, applyFit };
  }

  let index = 0;
  let elapsed = 0;

  return {
    texture,
    tick: (dt) => {
      elapsed += dt * 1000;
      let painted = false;
      let steps = 0;
      for (; steps < 8; steps++) {
        const delay = frameDelay(frames[index]);
        if (elapsed < delay) break;
        elapsed -= delay;
        index = (index + 1) % frames.length;
        if (index === 0) reset();
        paint(frames[index]);
        painted = true;
      }
      if (steps === 8) elapsed = 0;
      if (painted) texture.needsUpdate = true;
    },
    dispose,
    applyFit,
  };
}

export async function loadMedia(
  src: string,
  kind: MediaKind,
): Promise<LoadedMedia> {
  if (kind === "video") {
    const video = await loadVideo(src);
    const texture = prepare(new VideoTexture(video), true);
    const applyFit = makeFit(
      texture,
      video,
      video.videoWidth / Math.max(1, video.videoHeight),
    );
    return {
      texture,
      tick: () => {
        texture.needsUpdate = true;
      },
      dispose: () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        texture.dispose();
      },
      applyFit,
    };
  }

  if (kind === "gif") {
    try {
      return await loadGif(src);
    } catch {
      /* show the first frame if decoding fails */
    }
  }

  const img = await loadImage(src);
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);

  const texture = prepare(new Texture(img));
  return {
    texture,
    tick: null,
    dispose: () => {
      img.src = "";
      texture.dispose();
    },
    applyFit: makeFit(texture, img, aspect),
  };
}

function makeFit(
  texture: Texture,
  source: CanvasImageSource,
  aspect: number,
): (panelAspect: number) => void {
  const energy = sampleEnergy(source);
  return (panelAspect: number) => {
    applyCoverFit(texture, aspect, panelAspect, energy);
  };
}
