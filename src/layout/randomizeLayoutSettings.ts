import {
  defaultMaxCellSize,
  defaultMinCellSize,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import type { FrameSettings, MosaicBlock, Orientation } from "../types";
import { randomizeColors, type Rng } from "./generateLayout";

function pickInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Randomize layout sliders — shapes, colours, and grid density stay under user control. */
export function randomizeLayoutSettings(
  settings: FrameSettings,
  orientation: Orientation,
  rng: Rng = Math.random,
): FrameSettings {
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);

  const randomWidth = rng() > 0.15;
  const randomHeight = rng() > 0.15;
  const ringEnabled = Boolean(settings.shapes?.ring);

  return {
    ...settings,
    ringThickness: ringEnabled
      ? pickInt(rng, 0, 100)
      : settings.ringThickness,
    fillAmount: pickInt(rng, 10, 100),
    weight: pickInt(rng, 0, 100),
    scaleBlend: pickInt(rng, 0, 6),
    minCellSize: defaultMinCellSize(),
    maxCellSize: defaultMaxCellSize(settings.density),
    randomWidth,
    randomHeight,
    maxWidth: randomWidth ? pickInt(rng, 2, widthMax) : 1,
    maxHeight: randomHeight ? pickInt(rng, 2, heightMax) : 1,
    gridOverlayChaos: pickInt(rng, 0, 100),
  };
}

/** Assign palette colours to a new layout using Amount weights. */
export function carryOverBlockColors(
  newBlocks: MosaicBlock[],
  palette: string[],
  amounts?: number[],
  rng: Rng = Math.random,
): MosaicBlock[] {
  if (newBlocks.length === 0) return newBlocks;
  const activePalette = palette.length > 0 ? palette : ["#ffffff"];
  return randomizeColors(newBlocks, activePalette, amounts, rng);
}
