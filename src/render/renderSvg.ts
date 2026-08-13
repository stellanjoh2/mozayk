import {
  blockFillRect,
  blockPixelRect,
  crossFillRects,
  getGridDimensions,
  seamOverlapPx,
  triangleFillPoints,
} from "../grid/gridMath";
import type { FrameSettings, GridDimensions, MosaicBlock } from "../types";
import {
  gridCrossesPathData,
  gridOverlayDimensions,
  gridOverlayPathData,
  resolveGridCrossesStyle,
  resolveGridOverlayStyle,
  type GridOverlayStyle,
} from "./gridOverlay";
import type { RenderOptions } from "./renderFrame";
import { ringInnerRadius } from "./ringGeometry";

function svgRing(
  cx: number,
  cy: number,
  outerR: number,
  ringThickness: number,
  cellSize: number,
  color: string,
): string {
  if (outerR <= 0) return "";

  const innerR = ringInnerRadius(outerR, ringThickness, cellSize);

  if (innerR <= 0) {
    return `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${color}"/>`;
  }

  const d = [
    `M ${cx - outerR} ${cy}`,
    `a ${outerR} ${outerR} 0 1 0 ${outerR * 2} 0`,
    `a ${outerR} ${outerR} 0 1 0 ${-outerR * 2} 0`,
    `M ${cx - innerR} ${cy}`,
    `a ${innerR} ${innerR} 0 1 1 ${innerR * 2} 0`,
    `a ${innerR} ${innerR} 0 1 1 ${-innerR * 2} 0`,
  ].join(" ");

  return `<path fill="${color}" fill-rule="evenodd" d="${d}"/>`;
}

function svgBlock(
  block: MosaicBlock,
  grid: GridDimensions,
  ringThickness: number,
): string {
  const { x, y, width: drawW, height: drawH } = blockPixelRect(grid, block);

  if (block.shape === "ring") {
    const diameter = Math.min(drawW, drawH);
    return svgRing(
      x + drawW / 2,
      y + drawH / 2,
      diameter / 2,
      ringThickness,
      grid.cellSize,
      block.color,
    );
  }

  if (block.shape === "sphere") {
    const diameter = Math.min(drawW, drawH);
    const cx = x + drawW / 2;
    const cy = y + drawH / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${diameter / 2}" fill="${block.color}"/>`;
  }

  if (block.shape === "triangle") {
    const points = triangleFillPoints(
      { x, y, width: drawW, height: drawH },
      seamOverlapPx(grid),
    )
      .map(([px, py]) => `${px},${py}`)
      .join(" ");
    return `<polygon points="${points}" fill="${block.color}"/>`;
  }

  if (block.shape === "cross") {
    const { horizontal, vertical } = crossFillRects(
      { x, y, width: drawW, height: drawH },
      seamOverlapPx(grid),
    );
    return [
      `<rect x="${horizontal.x}" y="${horizontal.y}" width="${horizontal.width}" height="${horizontal.height}" fill="${block.color}"/>`,
      `<rect x="${vertical.x}" y="${vertical.y}" width="${vertical.width}" height="${vertical.height}" fill="${block.color}"/>`,
    ].join("");
  }

  const fill = blockFillRect(grid, block);
  return `<rect x="${fill.x}" y="${fill.y}" width="${fill.width}" height="${fill.height}" fill="${block.color}"/>`;
}

function svgBackground(
  width: number,
  height: number,
  settings: RenderOptions["settings"],
  sourceDataUrl?: string,
  transparentBackground?: boolean,
): string {
  if (settings.showSourceImage && sourceDataUrl) {
    return `<image href="${sourceDataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  }

  if (transparentBackground || settings.background === "transparent") {
    return "";
  }

  return `<rect width="${width}" height="${height}" fill="#000000"/>`;
}

function svgOverlayPath(style: GridOverlayStyle, d: string): string {
  const blend =
    style.blendMode !== "normal"
      ? ` style="mix-blend-mode:${style.blendMode}"`
      : "";
  return `<path d="${d}" fill="none" stroke="${style.color}" stroke-width="${style.lineWidth}" stroke-opacity="${style.opacity}"${blend}/>`;
}

function svgGridOverlay(
  orientation: RenderOptions["orientation"],
  settings: FrameSettings,
  width: number,
  height: number,
): string {
  const parts: string[] = [];

  const lines = resolveGridOverlayStyle(settings);
  if (lines) {
    const grid = gridOverlayDimensions(orientation, width, height, lines);
    parts.push(svgOverlayPath(lines, gridOverlayPathData(grid, lines.chaos)));
  }

  const crosses = resolveGridCrossesStyle(settings);
  if (crosses) {
    const grid = gridOverlayDimensions(orientation, width, height, crosses);
    parts.push(
      svgOverlayPath(
        crosses,
        gridCrossesPathData(grid, crosses.chaos, crosses.size),
      ),
    );
  }

  return parts.join("\n  ");
}

export type SvgRenderOptions = RenderOptions & {
  sourceDataUrl?: string;
};

export function renderMosaicToSvg(options: SvgRenderOptions): string {
  const {
    orientation,
    settings,
    blocks,
    width,
    height,
    sourceDataUrl,
    omitColors,
    transparentBackground,
  } = options;
  const grid = getGridDimensions(orientation, settings.density, width, height);

  const shapes = blocks
    .filter((block) => block.color && !omitColors?.has(block.color))
    .map((block) => svgBlock(block, grid, settings.ringThickness))
    .join("\n  ");

  const overlay =
    settings.gridOverlay || settings.gridCrosses
      ? svgGridOverlay(orientation, settings, width, height)
      : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    svgBackground(
      width,
      height,
      settings,
      sourceDataUrl,
      transparentBackground,
    ),
    shapes,
    overlay,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}
