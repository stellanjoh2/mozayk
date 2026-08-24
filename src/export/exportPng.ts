import { zipSync } from "fflate";
import { getExportSize, type ExportPreset } from "../config";
import { ensureCachedSourceImage } from "../import/imageSource";
import { renderMosaicToBlob } from "../render/renderFrame";
import { lockedColorsSet } from "../state/frameUtils";
import type { Frame, Orientation } from "../types";
import { downloadBlob, mosaicFrameFileName } from "./downloadBlob";

export async function loadSourceImageForFrame(
  frame: Frame,
): Promise<HTMLImageElement | null> {
  if (!frame.settings.showSourceImage || !frame.imageSource) return null;
  try {
    return await ensureCachedSourceImage(frame.imageSource.dataUrl);
  } catch {
    return null;
  }
}

export async function loadBackgroundImageForFrame(
  frame: Frame,
): Promise<HTMLImageElement | null> {
  if (!frame.backgroundImage) return null;
  try {
    return await ensureCachedSourceImage(frame.backgroundImage.dataUrl);
  } catch {
    return null;
  }
}

export async function loadTextureOverlayForFrame(
  frame: Frame,
): Promise<HTMLImageElement | null> {
  if (!frame.textureOverlay) return null;
  try {
    return await ensureCachedSourceImage(frame.textureOverlay.dataUrl);
  } catch {
    return null;
  }
}

export type StillImageFormat = "png" | "jpg";

const JPEG_QUALITY = 0.92;

function stillImageEncode(format: StillImageFormat): {
  type: string;
  quality?: number;
  ext: StillImageFormat;
  label: string;
} {
  if (format === "jpg") {
    return {
      type: "image/jpeg",
      quality: JPEG_QUALITY,
      ext: "jpg",
      label: "JPG",
    };
  }
  return { type: "image/png", ext: "png", label: "PNG" };
}

export async function exportCurrentFrame(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
  frameIndex: number,
  format: StillImageFormat = "png",
): Promise<void> {
  const encode = stillImageEncode(format);
  const [width, height] = getExportSize(orientation, preset);
  const [sourceImage, backgroundImage, textureOverlayImage] = await Promise.all([
    loadSourceImageForFrame(frame),
    loadBackgroundImageForFrame(frame),
    loadTextureOverlayForFrame(frame),
  ]);
  const blob = await renderMosaicToBlob(
    {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width,
      height,
      sourceImage,
      backgroundImage,
      textureOverlayImage,
    },
    encode.type,
    encode.quality,
  );
  if (!blob) throw new Error(`${encode.label} export failed`);
  downloadBlob(blob, mosaicFrameFileName(frameIndex, encode.ext));
}

export async function exportCurrentFrameTransparent(
  frame: Frame,
  orientation: Orientation,
  preset: ExportPreset,
  frameIndex: number,
): Promise<void> {
  const [width, height] = getExportSize(orientation, preset);
  const [sourceImage, backgroundImage, textureOverlayImage] = await Promise.all([
    loadSourceImageForFrame(frame),
    loadBackgroundImageForFrame(frame),
    loadTextureOverlayForFrame(frame),
  ]);
  const blob = await renderMosaicToBlob({
    orientation,
    settings: frame.settings,
    blocks: frame.blocks,
    width,
    height,
    sourceImage,
    backgroundImage,
    textureOverlayImage,
    omitColors: lockedColorsSet(frame.settings),
    transparentBackground: true,
  });
  if (!blob) throw new Error("PNG export failed");
  downloadBlob(blob, mosaicFrameFileName(frameIndex, "png", "_transparent"));
}

export async function exportAllFrames(
  frames: Frame[],
  orientation: Orientation,
  preset: ExportPreset,
  format: StillImageFormat = "png",
): Promise<void> {
  const encode = stillImageEncode(format);
  const [width, height] = getExportSize(orientation, preset);
  const files: Record<string, Uint8Array> = {};

  for (let i = 0; i < frames.length; i++) {
    const [sourceImage, backgroundImage, textureOverlayImage] = await Promise.all([
      loadSourceImageForFrame(frames[i]),
      loadBackgroundImageForFrame(frames[i]),
      loadTextureOverlayForFrame(frames[i]),
    ]);
    const blob = await renderMosaicToBlob(
      {
        orientation,
        settings: frames[i].settings,
        blocks: frames[i].blocks,
        width,
        height,
        sourceImage,
        backgroundImage,
        textureOverlayImage,
      },
      encode.type,
      encode.quality,
    );
    if (!blob) throw new Error(`${encode.label} export failed`);
    const buffer = new Uint8Array(await blob.arrayBuffer());
    files[mosaicFrameFileName(i, encode.ext)] = buffer;
  }

  const zipped = zipSync(files);
  const zipName =
    format === "jpg" ? "mozayk_jpg_sequence.zip" : "mozayk_sequence.zip";
  downloadBlob(new Blob([zipped], { type: "application/zip" }), zipName);
}
