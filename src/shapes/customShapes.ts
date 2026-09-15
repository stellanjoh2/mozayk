import { ensureCachedSourceImage, coverCropRect } from "../import/imageSource";
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

/** Cover-crop into the cell's inscribed square (same grid math as gallery shapes). */
export function fillCustomShape(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: PixelRect,
  cornerRadius = 0,
): void {
  const square = inscribedPixelSquare(rect);
  if (square.width <= 0 || square.height <= 0) return;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (iw <= 0 || ih <= 0) return;
  const { sx, sy, sw, sh } = coverCropRect(iw, ih, square.width, square.height);
  const radius = Math.min(
    blockCornerRadiusPx(square.width, square.height, cornerRadius),
    square.width / 2,
    square.height / 2,
  );

  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(square.x, square.y, square.width, square.height, radius);
    ctx.clip();
  }
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    square.x,
    square.y,
    square.width,
    square.height,
  );
  ctx.restore();
}

export function svgCustomShape(
  dataUrl: string,
  rect: PixelRect,
  cornerRadius = 0,
  clipId?: string,
): string {
  const square = inscribedPixelSquare(rect);
  if (square.width <= 0 || square.height <= 0) return "";
  const href = dataUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const image = `<image href="${href}" x="${square.x}" y="${square.y}" width="${square.width}" height="${square.height}" preserveAspectRatio="xMidYMid slice"/>`;
  const radius = Math.min(
    blockCornerRadiusPx(square.width, square.height, cornerRadius),
    square.width / 2,
    square.height / 2,
  );
  if (radius <= 0 || !clipId) return image;

  return [
    `<defs><clipPath id="${clipId}"><rect x="${square.x}" y="${square.y}" width="${square.width}" height="${square.height}" rx="${radius}" ry="${radius}"/></clipPath></defs>`,
    `<g clip-path="url(#${clipId})">${image}</g>`,
  ].join("");
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
