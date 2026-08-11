import { getGridDimensions } from "../grid/gridMath";
import type { GridDimensions, MosaicBlock } from "../types";
import type { RenderOptions } from "./renderFrame";

function svgRing(
  cx: number,
  cy: number,
  outerR: number,
  ringThickness: number,
  color: string,
): string {
  if (outerR <= 0) return "";

  if (ringThickness <= 0) {
    return `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="${color}"/>`;
  }

  const holeRatio = Math.min(0.95, Math.max(0.05, ringThickness / 100));
  const innerR = outerR * holeRatio;
  const bandWidth = outerR - innerR;

  if (bandWidth < 2) {
    const strokeWidth = Math.max(1, bandWidth);
    const r = outerR - strokeWidth / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>`;
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
  const x = block.col * grid.cellSize;
  const y = block.row * grid.cellSize;
  const drawW = block.width * grid.cellSize;
  const drawH = block.height * grid.cellSize;

  if (block.shape === "ring") {
    const diameter = Math.min(drawW, drawH);
    return svgRing(
      x + drawW / 2,
      y + drawH / 2,
      diameter / 2,
      ringThickness,
      block.color,
    );
  }

  if (block.shape === "sphere") {
    const diameter = Math.min(drawW, drawH);
    const cx = x + drawW / 2;
    const cy = y + drawH / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${diameter / 2}" fill="${block.color}"/>`;
  }

  return `<rect x="${x}" y="${y}" width="${drawW}" height="${drawH}" fill="${block.color}"/>`;
}

function svgCheckerboardPattern(cell = 20): string {
  const half = cell / 2;
  return [
    `<pattern id="mosaik-checker" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">`,
    `<rect width="${half}" height="${half}" fill="#1a1a1a"/>`,
    `<rect x="${half}" width="${half}" height="${half}" fill="#2a2a2a"/>`,
    `<rect y="${half}" width="${half}" height="${half}" fill="#2a2a2a"/>`,
    `<rect x="${half}" y="${half}" width="${half}" height="${half}" fill="#1a1a1a"/>`,
    `</pattern>`,
  ].join("");
}

function svgBackground(
  width: number,
  height: number,
  mode: RenderOptions["settings"]["background"],
): string {
  if (mode === "black") {
    return `<rect width="${width}" height="${height}" fill="#000000"/>`;
  }
  return `<rect width="${width}" height="${height}" fill="url(#mosaik-checker)"/>`;
}

export function renderMosaicToSvg(options: RenderOptions): string {
  const { orientation, settings, blocks, width, height } = options;
  const grid = getGridDimensions(orientation, settings.density, width, height);

  const defs =
    settings.background === "transparent" ? `<defs>${svgCheckerboardPattern()}</defs>` : "";

  const shapes = blocks
    .filter((block) => block.color)
    .map((block) => svgBlock(block, grid, settings.ringThickness))
    .join("\n  ");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    defs,
    svgBackground(width, height, settings.background),
    shapes,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}
