import {
  maxCellSizeSliderMax,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import type { FrameSettings, MosaicBlock, Orientation } from "../types";
import type { Rng } from "./generateLayout";

function pickInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Randomize layout sliders — colours and grid stay under user control. */
export function randomizeLayoutSettings(
  settings: FrameSettings,
  orientation: Orientation,
  rng: Rng = Math.random,
): FrameSettings {
  const cellMax = maxCellSizeSliderMax(settings.density, orientation);
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);

  const randomWidth = rng() > 0.15;
  const randomHeight = rng() > 0.15;
  const maxCellSize = pickInt(rng, 2, cellMax);
  const minCellSize = pickInt(rng, 1, Math.min(4, maxCellSize));

  return {
    ...settings,
    shapeMix: pickInt(rng, 0, 100),
    fillAmount: pickInt(rng, 10, 100),
    weight: pickInt(rng, 0, 100),
    scaleBlend: pickInt(rng, 1, 6),
    minCellSize,
    maxCellSize,
    randomWidth,
    randomHeight,
    maxWidth: randomWidth ? pickInt(rng, 2, widthMax) : 1,
    maxHeight: randomHeight ? pickInt(rng, 2, heightMax) : 1,
  };
}

/** Reassign previous block colours to a new layout without picking new swatches. */
export function carryOverBlockColors(
  newBlocks: MosaicBlock[],
  oldBlocks: MosaicBlock[],
  palette: string[],
  rng: Rng = Math.random,
): MosaicBlock[] {
  const fallback = palette[0] ?? "#ffffff";
  const pool = oldBlocks.map((block) => block.color || fallback).filter(Boolean);

  if (pool.length === 0) {
    return newBlocks.map((block) => ({ ...block, color: fallback }));
  }

  const shuffled = shuffle(pool, rng);
  const colors: string[] = [];
  while (colors.length < newBlocks.length) {
    colors.push(...shuffled);
  }

  return newBlocks.map((block, index) => ({
    ...block,
    color: colors[index] ?? fallback,
  }));
}
