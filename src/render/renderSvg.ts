import { blockPixelRect, getGridDimensions } from "../grid/gridMath";
import type { GridDimensions, MosaicBlock } from "../types";
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
    // Always half of a square (never stretch with the cell).
    const size = Math.min(drawW, drawH);
    const ox = x + (drawW - size) / 2;
    const oy = y + (drawH - size) / 2;
    const points = `${ox},${oy} ${ox + size},${oy} ${ox + size},${oy + size}`;
    return `<polygon points="${points}" fill="${block.color}"/>`;
  }

  return `<rect x="${x}" y="${y}" width="${drawW}" height="${drawH}" fill="${block.color}"/>`;
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
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}
