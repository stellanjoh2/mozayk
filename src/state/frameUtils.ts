import { MAX_COLORS } from "../config";
import { scaleGridUnits } from "../grid/density";
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
  return { sphere: true, ring: false };
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

export function colorGrainForSettings(settings: FrameSettings): number[] {
  const { colors, colorGrain } = settings;
  if (colorGrain && colorGrain.length === colors.length) {
    return colorGrain;
  }
  return Array.from({ length: colors.length }, () => 0);
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
    colorGrain: [0],
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

export function duplicateFrame(frame: Frame): Frame {
  return {
    id: createId(),
    settings: structuredClone(frame.settings),
    blocks: frame.blocks.map((block) => ({ ...block })),
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

export function regenerateFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  const clamped = clampSettingsForOrientation(frame.settings, orientation);
  const settings = { ...clamped, colors: [...frame.settings.colors] };
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    frame.blocks,
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...frame, settings, blocks };
}

export function randomizeFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  const randomized = randomizeLayoutSettings(frame.settings, orientation);
  const clamped = clampSettingsForOrientation(randomized, orientation);
  const settings = { ...clamped, colors: [...frame.settings.colors] };
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    frame.blocks,
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
  );
  return { ...frame, blocks };
}

export function randomizeFrameNewColors(frame: Frame): Frame {
  const colors = generateRandomPalette(frame.settings.colors.length);
  const blocks = randomizeColors(
    frame.blocks,
    colors,
    colorAmountsForSettings(frame.settings),
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
    colorGrain: [...colorGrainForSettings(settings), 0],
  };
}

export function removeColorFromSettings(
  settings: FrameSettings,
  index: number,
): FrameSettings {
  if (settings.colors.length <= 1) return settings;
  const colors = settings.colors.filter((_, i) => i !== index);
  const colorGrain = colorGrainForSettings(settings).filter((_, i) => i !== index);
  return {
    ...settings,
    colors,
    colorAmounts: equalColorAmounts(colors.length),
    colorGrain,
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
  const maxSpan = orientation === "landscape" ? 16 * settings.density : 9 * settings.density;
  const maxRow = orientation === "landscape" ? 9 * settings.density : 16 * settings.density;
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
