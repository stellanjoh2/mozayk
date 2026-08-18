import {
  defaultMaxCellSize,
  defaultMinCellSize,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import type {
  FrameSettings,
  MosaicBlock,
  Orientation,
} from "../types";
import { randomizeColors, type Rng } from "./generateLayout";

function pickInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

export function randomInstanceSeed(rng: Rng = Math.random): number {
  return (rng() * 0x100000000) >>> 0;
}

/** Mint seeds for overlays/crosses/blur/data-fields. */
export function mintChaosSeeds(
  settings: FrameSettings,
  rng: Rng = Math.random,
): FrameSettings {
  return {
    ...settings,
    gridOverlaySeed: randomInstanceSeed(rng),
    gridCrossesSeed: randomInstanceSeed(rng),
    gridBlurSeed: randomInstanceSeed(rng),
    dataFieldsSeed: randomInstanceSeed(rng),
  };
}

/** Randomize layout sliders — shapes, colours, and grid density stay under user control. */
export function randomizeLayoutSettings(
  settings: FrameSettings,
  orientation: Orientation,
  rng: Rng = Math.random,
): FrameSettings {
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);

  const ringEnabled = Boolean(settings.shapes?.ring);
  const randomWidth = rng() > 0.15;
  const randomHeight = rng() > 0.15;

  return {
    ...settings,
    ringThickness: !ringEnabled ? settings.ringThickness : pickInt(rng, 0, 100),
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
    gridOverlaySeed: randomInstanceSeed(rng),
    gridCrossesChaos: pickInt(rng, 0, 100),
    gridCrossesSeed: randomInstanceSeed(rng),
    gridBlurChaos: pickInt(rng, 0, 100),
    gridBlurSeed: randomInstanceSeed(rng),
    dataFieldsSeed: randomInstanceSeed(rng),
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
