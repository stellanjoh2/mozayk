import { MAX_COLORS } from "../config";
import { scaleGridUnits } from "../grid/density";
import { transposeBlocks } from "../grid/gridMath";
import {
  generateLayout,
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

export function createDefaultSettings(): FrameSettings {
  return {
    density: 6,
    shapeMix: 50,
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
    background: "black",
  };
}

export function createInitialFrame(orientation: Orientation): Frame {
  const settings = createDefaultSettings();
  let blocks = generateLayout(orientation, settings);
  blocks = randomizeColors(blocks, settings.colors);
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

export function regenerateFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  const settings = clampSettingsForOrientation(frame.settings, orientation);
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    frame.blocks,
    settings.colors,
  );
  return { ...frame, settings, blocks };
}

export function randomizeFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  const settings = clampSettingsForOrientation(
    randomizeLayoutSettings(frame.settings, orientation),
    orientation,
  );
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    frame.blocks,
    settings.colors,
  );
  return { ...frame, settings, blocks };
}

export function randomizeFrameColors(frame: Frame): Frame {
  const blocks = randomizeColors(frame.blocks, frame.settings.colors);
  return { ...frame, blocks };
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
  return { ...settings, colors: [...settings.colors, next] };
}

export function removeColorFromSettings(
  settings: FrameSettings,
  index: number,
): FrameSettings {
  if (settings.colors.length <= 1) return settings;
  const colors = settings.colors.filter((_, i) => i !== index);
  return { ...settings, colors };
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
