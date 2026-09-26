import {
  containDestRect,
  coverCropRect,
  ensureCachedSourceImage,
  imageHasTransparency,
  type ImageFitMode,
} from "../import/imageSource";
import { inscribedPixelSquare, type PixelRect } from "../grid/gridMath";
import { blockCornerRadiusPx } from "../render/cornerRadius";
import type {
  CustomShapeRef,
  CustomShapeSlot,
  FrameSettings,
} from "../types";

export const MAX_CUSTOM_SHAPE_SLOTS = 8;

export const CUSTOM_SHAPE_ACCEPT =
  "image/svg+xml,image/png,image/jpeg,image/webp,image/bmp,.svg,.png,.jpg,.jpeg,.webp,.bmp";

const CUSTOM_SHAPE_EXTENSIONS = new Set([
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
]);

const CUSTOM_SHAPE_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
]);

export class UnsupportedCustomShapeError extends Error {
  readonly label: string;

  constructor(label: string) {
    super(`Unsupported custom shape type: ${label}`);
    this.name = "UnsupportedCustomShapeError";
    this.label = label;
  }
}

export function isCustomShapeRef(shape: string): shape is CustomShapeRef {
  return shape.startsWith("custom:") && shape.length > "custom:".length;
}

export function customShapeSlotId(shape: CustomShapeRef): string {
  return shape.slice("custom:".length);
}

export function toCustomShapeRef(id: string): CustomShapeRef {
  return `custom:${id}`;
}

export function createCustomShapeSlotId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileExtension(file: File): string | undefined {
  const parts = file.name.split(".");
  if (parts.length < 2) return undefined;
  return parts[parts.length - 1]?.toLowerCase();
}

export function unsupportedCustomShapeMessage(label: string): string {
  if (label === "GIF") {
    return "Animated GIFs aren't supported. Use SVG, PNG, JPEG, WebP, or BMP.";
  }
  return `${label} isn't supported. Use SVG, PNG, JPEG, WebP, or BMP.`;
}

/** SVG or still image — rejects GIF (animated) and other formats. */
export function validateCustomShapeFile(file: File): void {
  const extension = fileExtension(file);

  if (extension === "gif" || file.type === "image/gif") {
    throw new UnsupportedCustomShapeError("GIF");
  }

  if (file.type && CUSTOM_SHAPE_MIME_TYPES.has(file.type)) return;
  if (extension && CUSTOM_SHAPE_EXTENSIONS.has(extension)) return;

  if (file.type.startsWith("image/")) {
    const subtype = file.type.split("/")[1]?.split("+")[0]?.toUpperCase();
    throw new UnsupportedCustomShapeError(subtype || "This file type");
  }

  throw new UnsupportedCustomShapeError(
    extension ? extension.toUpperCase() : "This file type",
  );
}

export function isSvgDataUrl(dataUrl: string | undefined): boolean {
  if (!dataUrl) return false;
  return (
    dataUrl.startsWith("data:image/svg+xml") ||
    /\.svg(?:$|\?|#)/i.test(dataUrl)
  );
}

/**
 * Opaque photos cover the cell; transparent cutouts (and all SVGs) letterbox
 * so the silhouette isn't cropped. SVGs always contain — they are marks, not photos.
 */
export function fitForCustomShapeImage(
  image: HTMLImageElement,
  dataUrl: string = image.currentSrc || image.src,
): ImageFitMode {
  if (isSvgDataUrl(dataUrl)) return "contain";
  return imageHasTransparency(image) ? "contain" : "cover";
}

/** Cutouts (contain) take the mosaic colour; opaque photos keep their own pixels. */
export function tintCustomShapeWithBlockColor(fit: ImageFitMode): boolean {
  return fit === "contain";
}

let tintScratch: HTMLCanvasElement | null = null;
let tintScratchCtx: CanvasRenderingContext2D | null = null;

function tintScratchContext(
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!tintScratch) {
    tintScratch = document.createElement("canvas");
    tintScratchCtx = tintScratch.getContext("2d");
  }
  if (!tintScratchCtx) return null;
  if (tintScratch.width !== width || tintScratch.height !== height) {
    tintScratch.width = width;
    tintScratch.height = height;
  } else {
    tintScratchCtx.clearRect(0, 0, width, height);
  }
  return tintScratchCtx;
}

function drawCustomShapeImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  iw: number,
  ih: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  fit: ImageFitMode,
): void {
  if (fit === "contain") {
    const dest = containDestRect(iw, ih, dw, dh);
    ctx.drawImage(
      image,
      0,
      0,
      iw,
      ih,
      dx + dest.dx,
      dy + dest.dy,
      dest.dw,
      dest.dh,
    );
    return;
  }
  const { sx, sy, sw, sh } = coverCropRect(iw, ih, dw, dh);
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** Draw a custom shape into the cell's inscribed square. */
export function fillCustomShape(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: PixelRect,
  cornerRadius = 0,
  fit: ImageFitMode = fitForCustomShapeImage(image),
  /** Mosaic block colour — applied as a silhouette tint for transparent cutouts. */
  fillColor?: string,
): void {
  const square = inscribedPixelSquare(rect);
  if (square.width <= 0 || square.height <= 0) return;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (iw <= 0 || ih <= 0) return;
  const radius = Math.min(
    blockCornerRadiusPx(square.width, square.height, cornerRadius),
    square.width / 2,
    square.height / 2,
  );
  const tint =
    fillColor && tintCustomShapeWithBlockColor(fit) ? fillColor : undefined;

  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(square.x, square.y, square.width, square.height, radius);
    ctx.clip();
  }

  if (tint) {
    // Tint on a scratch layer so source-in does not erase the mosaic behind
    // transparent parts of the cutout.
    const layer = tintScratchContext(square.width, square.height);
    if (layer) {
      drawCustomShapeImage(
        layer,
        image,
        iw,
        ih,
        0,
        0,
        square.width,
        square.height,
        fit,
      );
      layer.globalCompositeOperation = "source-in";
      layer.fillStyle = tint;
      layer.fillRect(0, 0, square.width, square.height);
      layer.globalCompositeOperation = "source-over";
      ctx.drawImage(tintScratch!, square.x, square.y);
    } else {
      drawCustomShapeImage(
        ctx,
        image,
        iw,
        ih,
        square.x,
        square.y,
        square.width,
        square.height,
        fit,
      );
    }
  } else {
    drawCustomShapeImage(
      ctx,
      image,
      iw,
      ih,
      square.x,
      square.y,
      square.width,
      square.height,
      fit,
    );
  }
  ctx.restore();
}

export function svgCustomShape(
  dataUrl: string,
  rect: PixelRect,
  cornerRadius = 0,
  clipId?: string,
  fit: ImageFitMode = "contain",
  fillColor?: string,
): string {
  const square = inscribedPixelSquare(rect);
  if (square.width <= 0 || square.height <= 0) return "";
  const href = dataUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const aspect =
    fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  const image = `<image href="${href}" x="${square.x}" y="${square.y}" width="${square.width}" height="${square.height}" preserveAspectRatio="${aspect}"/>`;
  const tint =
    fillColor && tintCustomShapeWithBlockColor(fit)
      ? fillColor.replace(/"/g, "")
      : undefined;
  const defs: string[] = [];
  let content = image;
  if (tint) {
    const maskId = `${clipId ?? `cs${square.x}-${square.y}`}-mask`;
    defs.push(`<mask id="${maskId}" mask-type="alpha">${image}</mask>`);
    content = `<rect x="${square.x}" y="${square.y}" width="${square.width}" height="${square.height}" fill="${tint}" mask="url(#${maskId})"/>`;
  }
  const radius = Math.min(
    blockCornerRadiusPx(square.width, square.height, cornerRadius),
    square.width / 2,
    square.height / 2,
  );
  if (radius > 0 && clipId) {
    defs.push(
      `<clipPath id="${clipId}"><rect x="${square.x}" y="${square.y}" width="${square.width}" height="${square.height}" rx="${radius}" ry="${radius}"/></clipPath>`,
    );
    content = `<g clip-path="url(#${clipId})">${content}</g>`;
  }
  if (defs.length === 0) return content;
  return `<defs>${defs.join("")}</defs>${content}`;
}

export function findCustomShapeSlot(
  settings: FrameSettings,
  shape: CustomShapeRef,
): CustomShapeSlot | undefined {
  const id = customShapeSlotId(shape);
  return settings.customShapes?.find((slot) => slot.id === id);
}

/** Stable empty map so callers can bail out with Object.is when nothing to load. */
export const EMPTY_CUSTOM_SHAPE_IMAGES: ReadonlyMap<
  string,
  HTMLImageElement
> = new Map();

export async function loadCustomShapeImages(
  slots: CustomShapeSlot[] | undefined,
): Promise<Map<string, HTMLImageElement>> {
  if (!slots?.length) {
    return EMPTY_CUSTOM_SHAPE_IMAGES as Map<string, HTMLImageElement>;
  }

  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    slots.map(async (slot) => {
      if (!slot.dataUrl) return;
      try {
        const image = await ensureCachedSourceImage(slot.dataUrl);
        map.set(slot.id, image);
      } catch {
        /* skip broken assets */
      }
    }),
  );
  return map;
}

export function customShapesSignature(
  slots: CustomShapeSlot[] | undefined,
): string {
  if (!slots?.length) return "";
  return slots
    .map((slot) => `${slot.id}:${slot.enabled ? 1 : 0}:${slot.dataUrl ?? ""}`)
    .join("|");
}
