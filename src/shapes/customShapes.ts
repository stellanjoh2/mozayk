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

const SVG_TRIM_PAD_RATIO = 0.02;
const SVG_INTRINSIC_MAX = 512;

function formatSvgNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

export function decodeSvgDataUrl(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!/data:image\/svg\+xml/i.test(header)) return null;
  try {
    if (/;base64/i.test(header)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

export function encodeSvgDataUrl(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export type SvgContentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Compute a tight viewBox + intrinsic size from a content bounding box. */
export function tightSvgSizing(box: SvgContentBox): {
  viewBox: string;
  width: string;
  height: string;
} | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const pad = Math.max(box.width, box.height) * SVG_TRIM_PAD_RATIO;
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.width + pad * 2;
  const h = box.height + pad * 2;
  const viewBox = `${formatSvgNumber(x)} ${formatSvgNumber(y)} ${formatSvgNumber(w)} ${formatSvgNumber(h)}`;
  if (w >= h) {
    return {
      viewBox,
      width: String(SVG_INTRINSIC_MAX),
      height: String(Math.max(1, Math.round(SVG_INTRINSIC_MAX * (h / w)))),
    };
  }
  return {
    viewBox,
    height: String(SVG_INTRINSIC_MAX),
    width: String(Math.max(1, Math.round(SVG_INTRINSIC_MAX * (w / h)))),
  };
}

/** Rewrite viewBox (+ intrinsic width/height) so the mark fills mosaic cells. */
export function applyTightSvgViewBox(
  svgText: string,
  box: SvgContentBox,
): string {
  const sizing = tightSvgSizing(box);
  if (!sizing) return svgText;
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return svgText;
  }
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  if (!(svg instanceof Element) || svg.querySelector("parsererror")) {
    return svgText;
  }

  svg.setAttribute("viewBox", sizing.viewBox);
  svg.setAttribute("width", sizing.width);
  svg.setAttribute("height", sizing.height);
  svg.removeAttribute("x");
  svg.removeAttribute("y");

  return new XMLSerializer().serializeToString(svg);
}

function measureSvgContentBox(svgText: string): SvgContentBox | null {
  if (typeof document === "undefined") return null;
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const parsed = doc.documentElement;
  if (!(parsed instanceof SVGElement) || parsed.querySelector("parsererror")) {
    return null;
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none";
  const svg = document.importNode(parsed, true);
  if (!(svg instanceof SVGSVGElement)) {
    return null;
  }
  if (!svg.getAttribute("xmlns")) {
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const bbox = svg.getBBox();
    if (
      !Number.isFinite(bbox.x) ||
      !Number.isFinite(bbox.y) ||
      !Number.isFinite(bbox.width) ||
      !Number.isFinite(bbox.height) ||
      bbox.width <= 0 ||
      bbox.height <= 0
    ) {
      return null;
    }
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
    };
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

/** Crop SVG whitespace to the drawn content so marks sit like gallery icons. */
export function trimSvgWhitespace(svgText: string): string {
  const box = measureSvgContentBox(svgText);
  if (!box) return svgText;
  return applyTightSvgViewBox(svgText, box);
}

/**
 * SVGs: tight viewBox + real intrinsic size. Raster: unchanged.
 * Safe to call on every load — results are cached per data URL.
 */
const normalizedCustomShapeCache = new Map<string, string>();

export function normalizeCustomShapeDataUrl(dataUrl: string): string {
  if (!isSvgDataUrl(dataUrl)) return dataUrl;
  const cached = normalizedCustomShapeCache.get(dataUrl);
  if (cached) return cached;
  const svgText = decodeSvgDataUrl(dataUrl);
  if (!svgText) {
    normalizedCustomShapeCache.set(dataUrl, dataUrl);
    return dataUrl;
  }
  const normalized = encodeSvgDataUrl(trimSvgWhitespace(svgText));
  normalizedCustomShapeCache.set(dataUrl, normalized);
  normalizedCustomShapeCache.set(normalized, normalized);
  return normalized;
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
        const prepared = normalizeCustomShapeDataUrl(slot.dataUrl);
        const image = await ensureCachedSourceImage(prepared);
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
