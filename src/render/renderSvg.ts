import {
  blockPixelRect,
  crossFillRects,
  getGridDimensions,
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
import { blockCornerRadiusPx } from "./cornerRadius";
import type { RenderOptions } from "./renderFrame";
import { largestRingRadius, ringInnerRadius } from "./ringGeometry";
import { scaleCrossRects, scalePixelRect, shapeGapScale } from "./shapeGap";
import {
  peeledBlockSet,
  resolveWireframePeelStroke,
  svgWireframeBlock,
} from "./wireframePeel";

function svgRing(
  cx: number,
  cy: number,
  outerR: number,
  ringThickness: number,
  cellSize: number,
  color: string,
  fillRadius: number,
  gapScale: number,
): string {
  if (outerR <= 0) return "";

  const innerR =
    ringInnerRadius(outerR, ringThickness, cellSize, fillRadius) * gapScale;
  const r = outerR * gapScale;
  if (r <= 0) return "";

  if (innerR <= 0) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
  }

  const d = [
    `M ${cx - r} ${cy}`,
    `a ${r} ${r} 0 1 0 ${r * 2} 0`,
    `a ${r} ${r} 0 1 0 ${-r * 2} 0`,
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
  fillRadius: number,
  cornerRadius: number,
  shapeGap: number,
): string {
  const raw = blockPixelRect(grid, block);
  const { x, y, width: drawW, height: drawH } = scalePixelRect(raw, shapeGap);

  if (block.shape === "ring") {
    return svgRing(
      raw.x + raw.width / 2,
      raw.y + raw.height / 2,
      Math.min(raw.width, raw.height) / 2,
      ringThickness,
      grid.cellSize,
      block.color,
      fillRadius,
      shapeGapScale(shapeGap),
    );
  }

  if (block.shape === "sphere") {
    const diameter = Math.min(drawW, drawH);
    const cx = x + drawW / 2;
    const cy = y + drawH / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${diameter / 2}" fill="${block.color}"/>`;
  }

  if (block.shape === "triangle") {
    const points = triangleFillPoints({ x, y, width: drawW, height: drawH })
      .map(([px, py]) => `${px},${py}`)
      .join(" ");
    return `<polygon points="${points}" fill="${block.color}"/>`;
  }

  if (block.shape === "cross") {
    const arms = crossFillRects(grid, block);
    const { horizontal, vertical } = scaleCrossRects(
      arms.horizontal,
      arms.vertical,
      shapeGap,
    );
    return [
      `<rect x="${horizontal.x}" y="${horizontal.y}" width="${horizontal.width}" height="${horizontal.height}" fill="${block.color}"/>`,
      `<rect x="${vertical.x}" y="${vertical.y}" width="${vertical.width}" height="${vertical.height}" fill="${block.color}"/>`,
    ].join("");
  }

  const radius = blockCornerRadiusPx(drawW, drawH, cornerRadius);
  const round = radius > 0 ? ` rx="${radius}" ry="${radius}"` : "";
  return `<rect x="${x}" y="${y}" width="${drawW}" height="${drawH}"${round} fill="${block.color}"/>`;
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

  const fillRadius = largestRingRadius(blocks, grid);
  const peeled = peeledBlockSet(blocks, settings);
  const peelStroke = resolveWireframePeelStroke(settings.wireframePeelStroke);
  const shapes = blocks
    .filter((block) => block.color && !omitColors?.has(block.color))
    .map((block, index) =>
      peeled.has(block)
        ? svgWireframeBlock(
            block,
            grid,
            peelStroke,
            `wp${index}`,
            settings.cornerRadius,
            settings.shapeGap,
          )
        : svgBlock(
            block,
            grid,
            settings.ringThickness,
            fillRadius,
            settings.cornerRadius ?? 0,
            settings.shapeGap ?? 0,
          ),
    )
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
