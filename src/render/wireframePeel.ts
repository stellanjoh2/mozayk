import {
  blockPixelRect,
  crossFillRects,
  triangleFillPoints,
  type PixelRect,
} from "../grid/gridMath";
import type {
  FrameSettings,
  GridDimensions,
  GridOverlayStroke,
  MosaicBlock,
} from "../types";
import { blockCornerRadiusPx } from "./cornerRadius";
import { resolveGridOverlayStroke } from "./gridOverlayParams";
import { insetCrossRects, insetPixelRect } from "./shapeGap";

export const WIREFRAME_PEEL_AMOUNT_DEFAULT = 50;
export const WIREFRAME_PEEL_STROKE_DEFAULT = 1;

const NONE: ReadonlySet<MosaicBlock> = new Set();

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function resolveWireframePeelAmount(value: unknown): number {
  return clampInt(value, 0, 100, WIREFRAME_PEEL_AMOUNT_DEFAULT);
}

export function resolveWireframePeelStroke(value: unknown): GridOverlayStroke {
  return resolveGridOverlayStroke(value, WIREFRAME_PEEL_STROKE_DEFAULT);
}

/** Smallest-area blocks first. Stable by original index on ties. */
export function peeledBlockSet(
  blocks: readonly MosaicBlock[],
  settings: FrameSettings,
): ReadonlySet<MosaicBlock> {
  if (!settings.wireframePeel || blocks.length === 0) return NONE;

  const amount = resolveWireframePeelAmount(settings.wireframePeelAmount);
  if (amount <= 0) return NONE;
  if (amount >= 100) return new Set(blocks);

  const ranked = blocks.map((block, index) => ({
    block,
    index,
    area: block.width * block.height,
  }));
  ranked.sort((a, b) => a.area - b.area || a.index - b.index);
  const count = Math.round((ranked.length * amount) / 100);
  if (count <= 0) return NONE;
  return new Set(ranked.slice(0, count).map((item) => item.block));
}

function strokeInside(
  ctx: CanvasRenderingContext2D,
  color: string,
  stroke: number,
  build: () => void,
): void {
  ctx.save();
  ctx.beginPath();
  build();
  ctx.clip();
  ctx.beginPath();
  build();
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke * 2;
  ctx.lineJoin = "miter";
  ctx.miterLimit = 4;
  ctx.lineCap = "butt";
  ctx.stroke();
  ctx.restore();
}

function addRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
): void {
  if (radius > 0) {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.rect(x, y, width, height);
}

function addCirclePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  if (r <= 0) return;
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

function addTrianglePath(ctx: CanvasRenderingContext2D, rect: PixelRect): void {
  const points = triangleFillPoints(rect);
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.closePath();
}

function addPlusPath(
  ctx: CanvasRenderingContext2D,
  h: PixelRect,
  v: PixelRect,
): void {
  if (
    h.x === v.x &&
    h.y === v.y &&
    h.width === v.width &&
    h.height === v.height
  ) {
    ctx.rect(h.x, h.y, h.width, h.height);
    return;
  }

  const hx2 = h.x + h.width;
  const hy2 = h.y + h.height;
  const vx2 = v.x + v.width;
  const vy2 = v.y + v.height;

  ctx.moveTo(v.x, v.y);
  ctx.lineTo(vx2, v.y);
  ctx.lineTo(vx2, h.y);
  ctx.lineTo(hx2, h.y);
  ctx.lineTo(hx2, hy2);
  ctx.lineTo(vx2, hy2);
  ctx.lineTo(vx2, vy2);
  ctx.lineTo(v.x, vy2);
  ctx.lineTo(v.x, hy2);
  ctx.lineTo(h.x, hy2);
  ctx.lineTo(h.x, h.y);
  ctx.lineTo(v.x, h.y);
  ctx.closePath();
}

export function drawWireframeBlock(
  ctx: CanvasRenderingContext2D,
  block: MosaicBlock,
  grid: GridDimensions,
  stroke: number,
  cornerRadius?: number,
  shapeGap?: number,
): void {
  if (stroke <= 0) return;

  const raw = blockPixelRect(grid, block);
  const rect = insetPixelRect(raw, shapeGap, grid.cellSize);
  const { x, y, width: drawW, height: drawH } = rect;
  const color = block.color;

  if (block.shape === "ring" || block.shape === "sphere") {
    const r = Math.min(drawW, drawH) / 2;
    if (r <= 0) return;
    const cx = x + drawW / 2;
    const cy = y + drawH / 2;
    strokeInside(ctx, color, stroke, () => addCirclePath(ctx, cx, cy, r));
    return;
  }

  if (block.shape === "triangle") {
    strokeInside(ctx, color, stroke, () => addTrianglePath(ctx, rect));
    return;
  }

  if (block.shape === "cross") {
    const arms = crossFillRects(grid, block);
    const { horizontal, vertical } = insetCrossRects(
      arms.horizontal,
      arms.vertical,
      shapeGap,
      grid.cellSize,
    );
    strokeInside(ctx, color, stroke, () =>
      addPlusPath(ctx, horizontal, vertical),
    );
    return;
  }

  if (drawW <= 0 || drawH <= 0) return;
  const radius = Math.min(
    blockCornerRadiusPx(raw.width, raw.height, cornerRadius),
    drawW / 2,
    drawH / 2,
  );
  strokeInside(ctx, color, stroke, () =>
    addRectPath(ctx, x, y, drawW, drawH, radius),
  );
}

function svgClippedStroke(
  id: string,
  inner: string,
  color: string,
  stroke: number,
): string {
  return [
    `<clipPath id="${id}">${inner}</clipPath>`,
    `<g clip-path="url(#${id})" fill="none" stroke="${color}" stroke-width="${stroke * 2}" stroke-linejoin="miter" stroke-linecap="butt">`,
    inner,
    `</g>`,
  ].join("");
}

function svgRect(
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
): string {
  const round = radius > 0 ? ` rx="${radius}" ry="${radius}"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${round}/>`;
}

function svgCircle(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
}

function svgPlus(h: PixelRect, v: PixelRect): string {
  if (
    h.x === v.x &&
    h.y === v.y &&
    h.width === v.width &&
    h.height === v.height
  ) {
    return svgRect(h.x, h.y, h.width, h.height);
  }

  const hx2 = h.x + h.width;
  const hy2 = h.y + h.height;
  const vx2 = v.x + v.width;
  const vy2 = v.y + v.height;
  const d = [
    `M ${v.x} ${v.y}`,
    `L ${vx2} ${v.y}`,
    `L ${vx2} ${h.y}`,
    `L ${hx2} ${h.y}`,
    `L ${hx2} ${hy2}`,
    `L ${vx2} ${hy2}`,
    `L ${vx2} ${vy2}`,
    `L ${v.x} ${vy2}`,
    `L ${v.x} ${hy2}`,
    `L ${h.x} ${hy2}`,
    `L ${h.x} ${h.y}`,
    `L ${v.x} ${h.y}`,
    "Z",
  ].join(" ");
  return `<path d="${d}"/>`;
}

export function svgWireframeBlock(
  block: MosaicBlock,
  grid: GridDimensions,
  stroke: number,
  clipId: string,
  cornerRadius?: number,
  shapeGap?: number,
): string {
  if (stroke <= 0) return "";

  const raw = blockPixelRect(grid, block);
  const { x, y, width: drawW, height: drawH } = insetPixelRect(
    raw,
    shapeGap,
    grid.cellSize,
  );
  const color = block.color;

  if (block.shape === "ring" || block.shape === "sphere") {
    const r = Math.min(drawW, drawH) / 2;
    if (r <= 0) return "";
    return svgClippedStroke(
      clipId,
      svgCircle(x + drawW / 2, y + drawH / 2, r),
      color,
      stroke,
    );
  }

  if (block.shape === "triangle") {
    const points = triangleFillPoints({ x, y, width: drawW, height: drawH })
      .map(([px, py]) => `${px},${py}`)
      .join(" ");
    return svgClippedStroke(
      clipId,
      `<polygon points="${points}"/>`,
      color,
      stroke,
    );
  }

  if (block.shape === "cross") {
    const arms = crossFillRects(grid, block);
    const { horizontal, vertical } = insetCrossRects(
      arms.horizontal,
      arms.vertical,
      shapeGap,
      grid.cellSize,
    );
    return svgClippedStroke(
      clipId,
      svgPlus(horizontal, vertical),
      color,
      stroke,
    );
  }

  if (drawW <= 0 || drawH <= 0) return "";
  const radius = Math.min(
    blockCornerRadiusPx(raw.width, raw.height, cornerRadius),
    drawW / 2,
    drawH / 2,
  );
  return svgClippedStroke(
    clipId,
    svgRect(x, y, drawW, drawH, radius),
    color,
    stroke,
  );
}
