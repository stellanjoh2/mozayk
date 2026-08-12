import { MAX_COLORS } from "../config";
import { scaleGridUnits } from "../grid/density";
import { getGridCounts } from "../grid/gridMath";
import { transposeBlocks } from "../grid/gridMath";
import {
  generateLayout,
  generateRandomPalette,
  pickWeightedColor,
  randomizeColors,
} from "../layout/generateLayout";
import {
  carryOverBlockColors,
  randomizeLayoutSettings,
} from "../layout/randomizeLayoutSettings";
import { buildMergedLayoutFromImage } from "../import/imageImport";
import type { ImageImportResult } from "../import/imageImport";
import { getCachedSourceImage } from "../import/imageSource";
import type {
  BackgroundMode,
  Density,
  Frame,
  FrameSettings,
  Orientation,
} from "../types";

function createId(): string {
  return crypto.randomUUID();
}

export function createDefaultShapePalette(): FrameSettings["shapes"] {
  return { sphere: true, ring: false, triangle: false };
}

export function equalColorAmounts(count: number): number[] {
  if (count <= 0) return [100];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}

export function colorAmountsForSettings(settings: FrameSettings): number[] {
  const { colors, colorAmounts } = settings;
  if (colorAmounts && colorAmounts.length === colors.length) {
    return colorAmounts;
  }
  return equalColorAmounts(colors.length);
}

export function colorsLockedForSettings(settings: FrameSettings): boolean[] {
  const { colors, colorsLocked } = settings;
  if (colorsLocked && colorsLocked.length === colors.length) {
    return colorsLocked;
  }
  return colors.map(() => false);
}

/** Hex values currently paused / excluded from randomization & transparent export. */
export function lockedColorsSet(settings: FrameSettings): Set<string> {
  const locked = colorsLockedForSettings(settings);
  return new Set(settings.colors.filter((_, index) => locked[index]));
}

export function createDefaultSettings(): FrameSettings {
  return {
    density: 6,
    shapeMix: 50,
    shapes: createDefaultShapePalette(),
    ringThickness: 45,
    minCellSize: 1,
    maxCellSize: 12,
    maxHeight: 18,
    randomHeight: true,
    maxWidth: 24,
    randomWidth: true,
    fillAmount: 85,
    weight: 50,
    scaleBlend: 3,
    colors: ["#ffffff"],
    colorAmounts: [100],
    background: "black",
  };
}

export function createInitialFrame(orientation: Orientation): Frame {
  const settings = createDefaultSettings();
  let blocks = generateLayout(orientation, settings);
  blocks = randomizeColors(
    blocks,
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { id: createId(), settings, blocks };
}

export function createDefaultCanvas(orientation: Orientation = "landscape"): {
  orientation: Orientation;
  frames: Frame[];
} {
  return {
    orientation,
    frames: [createInitialFrame(orientation)],
  };
}

export function duplicateFrame(frame: Frame): Frame {
  return {
    id: createId(),
    settings: structuredClone(frame.settings),
    blocks: frame.blocks.map((block) => ({ ...block })),
    imageSource: frame.imageSource
      ? structuredClone(frame.imageSource)
      : undefined,
  };
}

export function updateFrameSettings(
  frame: Frame,
  patch: Partial<FrameSettings>,
): Frame {
  return {
    ...frame,
    settings: { ...frame.settings, ...patch },
  };
}

export function applyPastedSettings(
  frame: Frame,
  pasted: FrameSettings,
  orientation: Orientation,
): Frame {
  const settings = clampSettingsForOrientation(pasted, orientation);
  let blocks = generateLayout(orientation, settings);
  blocks = randomizeColors(
    blocks,
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...frame, settings, blocks };
}

export function relayoutImportedFrame(
  frame: Frame,
  orientation: Orientation,
  rng: () => number = Math.random,
): Frame {
  if (!frame.imageSource) return frame;

  const image = getCachedSourceImage(frame.imageSource.dataUrl);
  if (!image) return frame;

  // Keep user/edited colours when the palette length still matches the
  // import clusters — never wipe New Random Colours back to the photo palette.
  const clusterCount = frame.imageSource.paletteRgb.length;
  const displayPalette =
    frame.settings.colors.length === clusterCount
      ? [...frame.settings.colors]
      : [...frame.imageSource.palette];

  const settings = clampSettingsForOrientation(
    {
      ...frame.settings,
      colors: displayPalette,
      colorAmounts: colorAmountsForSettings({
        ...frame.settings,
        colors: displayPalette,
      }),
      layoutSource: "imported",
    },
    orientation,
  );

  const blocks = buildMergedLayoutFromImage(
    image,
    orientation,
    settings,
    displayPalette,
    frame.imageSource.paletteRgb,
    rng,
  );

  return { ...frame, settings, blocks };
}

export function regenerateFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  if (frame.imageSource) {
    return relayoutImportedFrame(frame, orientation);
  }

  const clamped = clampSettingsForOrientation(frame.settings, orientation);
  const settings = { ...clamped, colors: [...frame.settings.colors] };
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...frame, settings, blocks };
}

export function randomizeFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  if (frame.imageSource) {
    const randomized = randomizeLayoutSettings(frame.settings, orientation);
    return relayoutImportedFrame(
      { ...frame, settings: randomized },
      orientation,
    );
  }

  const randomized = randomizeLayoutSettings(frame.settings, orientation);
  const clamped = clampSettingsForOrientation(randomized, orientation);
  const settings = { ...clamped, colors: [...frame.settings.colors] };
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...frame, settings, blocks };
}

export function randomizeFrameCurrentColors(frame: Frame): Frame {
  const blocks = randomizeColors(
    frame.blocks,
    frame.settings.colors,
    colorAmountsForSettings(frame.settings),
    Math.random,
    colorsLockedForSettings(frame.settings),
  );
  return { ...frame, blocks };
}

export function randomizeFrameNewColors(frame: Frame): Frame {
  const locked = colorsLockedForSettings(frame.settings);
  const generated = generateRandomPalette(frame.settings.colors.length);
  const colors = frame.settings.colors.map((color, index) =>
    locked[index] ? color : generated[index],
  );
  const blocks = randomizeColors(
    frame.blocks,
    colors,
    colorAmountsForSettings(frame.settings),
    Math.random,
    locked,
  );
  return { ...frame, settings: { ...frame.settings, colors }, blocks };
}

export function transposeFrameBlocks(
  frame: Frame,
  from: Orientation,
  to: Orientation,
): Frame {
  if (from === to) return frame;
  return {
    ...frame,
    blocks: transposeBlocks(frame.blocks),
  };
}

export function addColorToSettings(settings: FrameSettings): FrameSettings {
  if (settings.colors.length >= MAX_COLORS) return settings;
  const palette = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
  const next =
    palette.find((color) => !settings.colors.includes(color)) ?? "#888888";
  const colors = [...settings.colors, next];
  return {
    ...settings,
    colors,
    colorAmounts: equalColorAmounts(colors.length),
    colorsLocked: [...colorsLockedForSettings(settings), false],
  };
}

export function removeColorFromSettings(
  settings: FrameSettings,
  index: number,
): FrameSettings {
  if (settings.colors.length <= 1) return settings;
  const colors = settings.colors.filter((_, i) => i !== index);
  return {
    ...settings,
    colors,
    colorAmounts: equalColorAmounts(colors.length),
    colorsLocked: colorsLockedForSettings(settings).filter((_, i) => i !== index),
  };
}

export function removeColorFromFrame(frame: Frame, index: number): Frame {
  if (frame.settings.colors.length <= 1) return frame;

  const removedColor = frame.settings.colors[index];
  const settings = removeColorFromSettings(frame.settings, index);
  const amounts = colorAmountsForSettings(settings);

  const blocks = frame.blocks.map((block) => {
    if (block.color !== removedColor) return block;
    return {
      ...block,
      color: pickWeightedColor(settings.colors, amounts, Math.random),
    };
  });

  return { ...frame, settings, blocks };
}

export function setBackground(
  settings: FrameSettings,
  background: BackgroundMode,
): FrameSettings {
  return { ...settings, background };
}

export function applyDensityChange(
  settings: FrameSettings,
  newDensity: Density,
): FrameSettings {
  if (settings.density === newDensity) return settings;

  const ratio = newDensity / settings.density;
  const scale = (value: number) => Math.max(1, Math.round(value * ratio));

  return {
    ...settings,
    density: newDensity,
    minCellSize: scale(settings.minCellSize),
    maxCellSize: scale(settings.maxCellSize),
    maxHeight: scale(settings.maxHeight),
    maxWidth: scale(settings.maxWidth),
  };
}

export function setDensity(
  settings: FrameSettings,
  density: Density,
): FrameSettings {
  return applyDensityChange(settings, density);
}

export function clampSettingsForOrientation(
  settings: FrameSettings,
  orientation: Orientation,
): FrameSettings {
  const { columns: maxSpan, rows: maxRow } = getGridCounts(
    orientation,
    settings.density,
  );
  const refMaxCell = scaleGridUnits(24, settings.density);
  return {
    ...settings,
    maxWidth: Math.min(settings.maxWidth, maxSpan),
    maxHeight: Math.min(settings.maxHeight, maxRow),
    maxCellSize: Math.min(settings.maxCellSize, Math.min(refMaxCell, Math.max(maxSpan, maxRow))),
    minCellSize: Math.min(settings.minCellSize, settings.maxCellSize),
  };
}

export function reorderFrames(
  frames: Frame[],
  fromIndex: number,
  toIndex: number,
): Frame[] {
  if (fromIndex === toIndex) return frames;
  const next = [...frames];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function activeIndexAfterReorder(
  activeIndex: number,
  fromIndex: number,
  toIndex: number,
): number {
  if (activeIndex === fromIndex) return toIndex;
  if (fromIndex < activeIndex && toIndex >= activeIndex) return activeIndex - 1;
  if (fromIndex > activeIndex && toIndex <= activeIndex) return activeIndex + 1;
  return activeIndex;
}

export function applyImageImport(
  frame: Frame,
  result: ImageImportResult,
): Frame {
  return {
    ...frame,
    settings: {
      ...frame.settings,
      colors: result.colors,
      colorAmounts: result.colorAmounts,
      colorsLocked: result.colors.map(() => false),
      fillAmount: 100,
      randomWidth: false,
      randomHeight: false,
      minCellSize: 1,
      maxCellSize: 1,
      layoutSource: "imported",
    },
    blocks: result.blocks,
    imageSource: result.imageSource,
  };
}
