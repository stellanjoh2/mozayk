import { downloadBlob } from "../export/downloadBlob";
import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  PNG_SCALE,
  SPEEDS,
  logoPieces,
  pieceOnInLoop,
  resolveLogoSvg,
  setPieceVisible,
  type Speed,
} from "./logoReveal";

const MOV_FPS = 30;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("MOV export failed"));
    img.src = url;
  });
}

export async function exportLogoMov(
  markup: string,
  colors: readonly string[],
  speed: Speed,
  options?: { transparent?: boolean },
): Promise<void> {
  const transparent = Boolean(options?.transparent);
  const {
    Output,
    MovOutputFormat,
    BufferTarget,
    CanvasSource,
    Quality,
    canEncodeVideo,
  } = await import("mediabunny");

  const quality = new Quality("high");
  const codec = transparent
    ? await (async () => {
        for (const next of ["prores", "hevc", "vp9"] as const) {
          if (await canEncodeVideo(next, { alpha: "keep", quality })) return next;
        }
        throw new Error(
          "Transparent MOV export needs a browser codec with alpha (ProRes, HEVC, or VP9)",
        );
      })()
    : "avc";

  if (!transparent && !(await canEncodeVideo("avc"))) {
    throw new Error("MOV export requires H.264 encoding (WebCodecs) in this browser");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:80vw";
  host.innerHTML = resolveLogoSvg(markup, colors);
  document.body.appendChild(host);

  const svg = host.querySelector("svg");
  if (!svg) {
    host.remove();
    throw new Error("MOV export failed");
  }

  const width = Math.round(LOGO_WIDTH * PNG_SCALE);
  const height = Math.round(LOGO_HEIGHT * PNG_SCALE);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const pieces = logoPieces(svg);
  if (pieces.length === 0) {
    host.remove();
    throw new Error("MOV export failed");
  }

  const phaseMs = SPEEDS[speed] * 1000;
  const durationS = (phaseMs * 2) / 1000;
  const frameCount = Math.round(durationS * MOV_FPS);
  const frameDurationS = 1 / MOV_FPS;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    host.remove();
    throw new Error("MOV export failed");
  }

  const output = new Output({
    format: new MovOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec,
    quality,
    keyFrameInterval: frameDurationS,
    ...(transparent ? { alpha: "keep" as const } : {}),
  });
  output.addVideoTrack(videoSource, { frameRate: MOV_FPS });
  await output.start();

  try {
    for (let i = 0; i < frameCount; i++) {
      const timeMs = (i / MOV_FPS) * 1000;
      for (const { el, t } of pieces) {
        setPieceVisible(el, pieceOnInLoop(t, timeMs, phaseMs));
      }
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      try {
        const img = await loadImage(url);
        if (transparent) ctx.clearRect(0, 0, width, height);
        else {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
      await videoSource.add(i * frameDurationS, frameDurationS);
    }

    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("MOV export failed");
    downloadBlob(
      new Blob([buffer], { type: "video/quicktime" }),
      transparent ? "mozayk-logotype-transparent.mov" : "mozayk-logotype.mov",
    );
  } finally {
    host.remove();
  }
}
