import { MAX_COLORS } from "../config";
import {
  defaultMaxCellSize,
  defaultMinCellSize,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import { getGridCounts } from "../grid/gridMath";
import { transposeBlocks } from "../grid/gridMath";
import {
  generateLayout,
  generateRandomPalette,
  IMPORTED_LAYOUT_SETTING_KEYS,
  LAYOUT_SETTING_KEYS,
  pickWeightedColor,
  randomizeColors,
  rerollShapes,
} from "../layout/generateLayout";
import {
  carryOverBlockColors,
  mintChaosSeeds,
  randomizeLayoutSettings,
} from "../layout/randomizeLayoutSettings";
import {
  buildMergedLayoutFromColorGrid,
  buildMergedLayoutFromImage,
  coverCropBlocks,
  coverCropColorGrid,
  gridExtentsFromBlocks,
  rasterizeBlockColorGrid,
  sameGridAspect,
} from "../import/imageImport";
import type { ImageImportResult } from "../import/imageImport";
import { getCachedSourceImage } from "../import/imageSource";
import type { SettingsClipboard } from "./settingsClipboard";
import type { PalettePreset } from "../presets/palettePresets";
import type {
  Density,
  Frame,
  FrameSettings,
  MosaicBlock,
  Orientation,
  OrientationLayout,
} from "../types";

function createId(): string {
  return crypto.randomUUID();
}

function dropOrientationLayout(frame: Frame): Frame {
  if (!frame.orientationLayout) return frame;
  const { orientationLayout: _dropped, ...rest } = frame;
  return rest;
}

function captureOrientationLayout(
  frame: Frame,
  orientation: Orientation,
): OrientationLayout {
  return (
    frame.orientationLayout ?? {
      orientation,
      blocks: cloneBlocks(frame.blocks),
      colors: [...frame.settings.colors],
    }
  );
}

function cloneBlocks(blocks: MosaicBlock[]): MosaicBlock[] {
  return blocks.map((block) => ({ ...block }));
}

function withDerivedLayout(
  source: OrientationLayout,
  orientation: Orientation,
  blocks: MosaicBlock[],
): OrientationLayout {
  if (orientation === source.orientation) return source;
  return {
    ...source,
    derived: {
      ...source.derived,
      [orientation]: cloneBlocks(blocks),
    },
  };
}

export function createDefaultShapePalette(): FrameSettings["shapes"] {
  return { sphere: false, ring: false, triangle: false, cross: false };
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
  const density = 5 as Density;
  const orientation: Orientation = "landscape";
  const heightMax = maxHeightSliderMax(density, orientation);
  const widthMax = maxWidthSliderMax(density, orientation);
  return {
    density,
    shapeMix: 50,
    shapes: createDefaultShapePalette(),
    ringThickness: 50,
    minCellSize: defaultMinCellSize(),
    maxCellSize: defaultMaxCellSize(density),
    maxHeight: Math.max(1, Math.round(heightMax / 2)),
    randomHeight: true,
    maxWidth: Math.max(1, Math.round(widthMax / 2)),
    randomWidth: true,
    fillAmount: 1,
    weight: 50,
    scaleBlend: 3,
    colors: ["#4b4b4b"],
    colorAmounts: [100],
    background: "#000000",
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
    textureOverlay: frame.textureOverlay
      ? structuredClone(frame.textureOverlay)
      : undefined,
    backgroundImage: frame.backgroundImage
      ? structuredClone(frame.backgroundImage)
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

function canTransposeOrientation(from: Orientation, to: Orientation): boolean {
  return (
    (from === "landscape" && to === "portrait") ||
    (from === "portrait" && to === "landscape")
  );
}

function blocksFitGrid(
  blocks: MosaicBlock[],
  columns: number,
  rows: number,
): boolean {
  return blocks.every(
    (block) =>
      block.col >= 0 &&
      block.row >= 0 &&
      block.width >= 1 &&
      block.height >= 1 &&
      block.col + block.width <= columns &&
      block.row + block.height <= rows,
  );
}

function restorePastedBlocks(
  pastedBlocks: MosaicBlock[] | undefined,
  sourceOrientation: Orientation | undefined,
  orientation: Orientation,
  columns: number,
  rows: number,
): MosaicBlock[] | null {
  if (!pastedBlocks || pastedBlocks.length === 0) return null;

  let blocks = pastedBlocks.map((block) => ({ ...block }));
  if (sourceOrientation && sourceOrientation !== orientation) {
    if (!canTransposeOrientation(sourceOrientation, orientation)) return null;
    blocks = transposeBlocks(blocks);
  }

  if (!blocksFitGrid(blocks, columns, rows)) return null;
  return blocks;
}

function remapBlockColors(
  blocks: MosaicBlock[],
  fromColors: string[],
  toColors: string[],
): MosaicBlock[] {
  if (toColors.length === 0) return blocks;
  return blocks.map((block) => {
    const index = fromColors.indexOf(block.color);
    const color =
      index >= 0
        ? toColors[Math.min(index, toColors.length - 1)]
        : toColors[0];
    return color === block.color ? block : { ...block, color };
  });
}

/** When blocks still use the photo palette, remap by import slot — not current settings. */
function importPaletteForRemap(frame: Frame): string[] | null {
  if (!frame.imageSource) return null;
  const importPalette = frame.imageSource.palette;
  if (importPalette.length === 0) return null;
  const importColors = new Set(importPalette);
  if (!frame.blocks.every((block) => importColors.has(block.color))) return null;
  return importPalette;
}

function settingsKeyChanged<K extends keyof FrameSettings>(
  keys: readonly K[],
  from: FrameSettings,
  to: FrameSettings,
): boolean {
  return keys.some((key) => from[key] !== to[key]);
}

function shapeSettingsChanged(from: FrameSettings, to: FrameSettings): boolean {
  if (from.shapeMix !== to.shapeMix) return true;
  const fromShapes = from.shapes ?? createDefaultShapePalette();
  const toShapes = to.shapes ?? createDefaultShapePalette();
  return (
    fromShapes.sphere !== toShapes.sphere ||
    fromShapes.ring !== toShapes.ring ||
    fromShapes.triangle !== toShapes.triangle ||
    fromShapes.cross !== toShapes.cross
  );
}

/** Snapshot of a frame's look for copy/paste style. Picture and mosaic stay on the destination. */
export function cloneFrameLook(frame: Frame): Frame {
  return {
    id: "look",
    settings: structuredClone(frame.settings),
    blocks: [],
    textureOverlay: frame.textureOverlay
      ? structuredClone(frame.textureOverlay)
      : undefined,
    backgroundImage: frame.backgroundImage
      ? structuredClone(frame.backgroundImage)
      : undefined,
  };
}

/** Copy style from `look` onto `frame`. Keeps this frame's picture and mosaic motion. */
export function applyLookToFrame(
  frame: Frame,
  look: Frame,
  orientation: Orientation,
): Frame {
  let settings = clampSettingsForOrientation(
    structuredClone(look.settings),
    orientation,
  );
  if (settings.layoutSource === "imported" && !frame.imageSource) {
    settings = { ...settings, layoutSource: "procedural" };
  }
  if (frame !== look) {
    settings = mintChaosSeeds(settings);
  }

  const next: Frame = {
    ...frame,
    settings,
    textureOverlay: look.textureOverlay
      ? structuredClone(look.textureOverlay)
      : undefined,
    backgroundImage: look.backgroundImage
      ? structuredClone(look.backgroundImage)
      : undefined,
  };

  const needsRelayout = frame.imageSource
    ? settingsKeyChanged(IMPORTED_LAYOUT_SETTING_KEYS, frame.settings, settings)
    : settingsKeyChanged(LAYOUT_SETTING_KEYS, frame.settings, settings);

  if (needsRelayout) {
    return regenerateFrameLayout(next, orientation);
  }

  let blocks = remapBlockColors(
    frame.blocks,
    importPaletteForRemap(frame) ?? frame.settings.colors,
    settings.colors,
  );
  if (shapeSettingsChanged(frame.settings, settings)) {
    blocks = rerollShapes(blocks, settings);
  }
  return { ...next, blocks };
}

export function applyLookToAllFrames(
  frames: Frame[],
  sourceIndex: number,
  orientation: Orientation,
): Frame[] {
  const look = frames[sourceIndex];
  if (!look || frames.length <= 1) return frames;
  return frames.map((frame) => applyLookToFrame(frame, look, orientation));
}

export function applyPastedSettings(
  frame: Frame,
  pasted: SettingsClipboard,
  orientation: Orientation,
): Frame {
  const settings = clampSettingsForOrientation(pasted.settings, orientation);
  const { columns, rows } = getGridCounts(orientation, settings.density);
  const restored = restorePastedBlocks(
    pasted.blocks,
    pasted.orientation,
    orientation,
    columns,
    rows,
  );

  if (restored) {
    const nextSettings =
      settings.layoutSource === "imported" && !frame.imageSource
        ? { ...settings, layoutSource: "procedural" as const }
        : settings;
    return {
      ...dropOrientationLayout(frame),
      settings: nextSettings,
      blocks: restored,
    };
  }

  const nextFrame = { ...dropOrientationLayout(frame), settings };
  if (nextFrame.imageSource) {
    return relayoutImportedFrame(nextFrame, orientation);
  }

  let blocks = generateLayout(orientation, settings);
  blocks = randomizeColors(
    blocks,
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...nextFrame, blocks };
}

/** Keep the current mosaic colours; scale or cover-crop into the new grid. */
function relayoutFromExistingColorGrid(
  frame: Frame,
  orientation: Orientation,
  rng: () => number,
): Frame | null {
  const oldExtents = gridExtentsFromBlocks(frame.blocks);
  if (
    frame.blocks.length === 0 ||
    oldExtents.columns <= 0 ||
    oldExtents.rows <= 0
  ) {
    return null;
  }

  const displayPalette = [...frame.settings.colors];
  const settings = clampSettingsForOrientation(
    {
      ...frame.settings,
      colors: displayPalette,
      colorAmounts: colorAmountsForSettings({
        ...frame.settings,
        colors: displayPalette,
      }),
    },
    orientation,
  );

  const { columns, rows } = getGridCounts(orientation, settings.density);
  const colorGrid = rasterizeBlockColorGrid(
    frame.blocks,
    oldExtents.columns,
    oldExtents.rows,
    "",
  );
  const resampled = coverCropColorGrid(colorGrid, columns, rows);
  const blocks = buildMergedLayoutFromColorGrid(
    resampled,
    displayPalette,
    settings,
    rng,
  );
  return { ...frame, settings, blocks };
}

export function relayoutImportedFrame(
  frame: Frame,
  orientation: Orientation,
  rng: () => number = Math.random,
): Frame {
  if (!frame.imageSource) return frame;

  const displayPalette = [...frame.settings.colors];
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

  const { columns, rows } = getGridCounts(orientation, settings.density);
  const oldExtents = gridExtentsFromBlocks(frame.blocks);
  const gridSizeChanged =
    oldExtents.columns > 0 &&
    oldExtents.rows > 0 &&
    (oldExtents.columns !== columns || oldExtents.rows !== rows);
  const aspectUnchanged = sameGridAspect(
    oldExtents.columns,
    oldExtents.rows,
    columns,
    rows,
  );

  // Same-ratio density changes keep the current mosaic (scale).
  // Ratio changes recrop the photo when it is available; otherwise cover-crop.
  if (gridSizeChanged && aspectUnchanged) {
    const kept = relayoutFromExistingColorGrid(
      { ...frame, settings },
      orientation,
      rng,
    );
    if (kept) return dropOrientationLayout({ ...kept, settings });
  }

  const image = getCachedSourceImage(frame.imageSource.dataUrl);
  if (image) {
    const blocks = buildMergedLayoutFromImage(
      image,
      orientation,
      settings,
      displayPalette,
      frame.imageSource.paletteRgb,
      rng,
    );
    return dropOrientationLayout({ ...frame, settings, blocks });
  }

  if (gridSizeChanged) {
    const kept = relayoutFromExistingColorGrid(
      { ...frame, settings },
      orientation,
      rng,
    );
    if (kept) return dropOrientationLayout({ ...kept, settings });
  }

  return dropOrientationLayout({ ...frame, settings });
}

/** Refit an existing mosaic to a new canvas ratio without reshuffling colours. */
export function relayoutFrameToOrientation(
  frame: Frame,
  from: Orientation,
  to: Orientation,
  _rng?: () => number,
): Frame {
  if (from === to) return frame;

  const source = captureOrientationLayout(frame, from);
  const settings = clampSettingsForOrientation(frame.settings, to);
  const layoutBlocks =
    to === source.orientation
      ? source.blocks
      : (source.derived?.[to] ?? null);
  if (layoutBlocks !== null) {
    return {
      ...frame,
      settings,
      blocks: remapBlockColors(layoutBlocks, source.colors, settings.colors),
      orientationLayout: source,
    };
  }

  const sourceBlocks = remapBlockColors(
    source.blocks,
    source.colors,
    settings.colors,
  );

  const derivedBlocks =
    !frame.imageSource && canTransposeOrientation(source.orientation, to)
      ? transposeBlocks(sourceBlocks)
      : coverCropBlocks(
          sourceBlocks,
          getGridCounts(source.orientation, settings.density).columns,
          getGridCounts(source.orientation, settings.density).rows,
          getGridCounts(to, settings.density).columns,
          getGridCounts(to, settings.density).rows,
        );

  return {
    ...frame,
    settings,
    blocks: derivedBlocks,
    orientationLayout: withDerivedLayout(source, to, derivedBlocks),
  };
}

export function regenerateFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  const base = dropOrientationLayout(frame);
  if (base.imageSource) {
    return relayoutImportedFrame(base, orientation);
  }

  const clamped = clampSettingsForOrientation(base.settings, orientation);
  const settings = { ...clamped, colors: [...base.settings.colors] };
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...base, settings, blocks };
}

export function randomizeFrameLayout(
  frame: Frame,
  orientation: Orientation,
): Frame {
  const base = dropOrientationLayout(frame);
  if (base.imageSource) {
    const randomized = randomizeLayoutSettings(base.settings, orientation);
    return relayoutImportedFrame(
      { ...base, settings: randomized },
      orientation,
    );
  }

  const randomized = randomizeLayoutSettings(base.settings, orientation);
  const clamped = clampSettingsForOrientation(randomized, orientation);
  const settings = { ...clamped, colors: [...base.settings.colors] };
  const blocks = carryOverBlockColors(
    generateLayout(orientation, settings),
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { ...base, settings, blocks };
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
  const previous = frame.settings.colors;
  const colors = previous.map((color, index) =>
    locked[index] ? color : generated[index],
  );
  const blocks = frame.blocks.map((block) => {
    const index = previous.indexOf(block.color);
    if (index < 0 || locked[index]) return block;
    return { ...block, color: colors[index] };
  });
  return { ...frame, settings: { ...frame.settings, colors }, blocks };
}

export function applyPalettePresetToFrame(
  frame: Frame,
  preset: PalettePreset,
): Frame {
  const colors = preset.colors.slice(0, MAX_COLORS);
  const colorAmounts =
    preset.colorAmounts && preset.colorAmounts.length === colors.length
      ? preset.colorAmounts
      : equalColorAmounts(colors.length);
  const colorsLocked = colors.map(() => false);
  const settings: FrameSettings = {
    ...frame.settings,
    colors,
    colorAmounts,
    colorsLocked,
  };
  // Imported frames derive block colours from the photo — remap by palette
  // slot instead of shuffling, so the silhouette stays intact.
  if (frame.imageSource) {
    const blocks = remapBlockColors(frame.blocks, frame.settings.colors, colors);
    return { ...frame, settings, blocks };
  }
  const blocks = randomizeColors(
    frame.blocks,
    colors,
    colorAmounts,
    Math.random,
    colorsLocked,
  );
  return { ...frame, settings, blocks };
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
  const colors = [next, ...settings.colors];
  return {
    ...settings,
    colors,
    colorAmounts: equalColorAmounts(colors.length),
    colorsLocked: [false, ...colorsLockedForSettings(settings)],
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
  background: string,
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
    minCellSize: defaultMinCellSize(),
    maxCellSize: defaultMaxCellSize(newDensity),
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
  return {
    ...settings,
    maxWidth: Math.min(settings.maxWidth, maxSpan),
    maxHeight: Math.min(settings.maxHeight, maxRow),
    minCellSize: defaultMinCellSize(),
    maxCellSize: defaultMaxCellSize(settings.density),
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
  const base = dropOrientationLayout(frame);
  return {
    ...base,
    settings: {
      ...frame.settings,
      colors: result.colors,
      colorAmounts: result.colorAmounts,
      colorsLocked: result.colors.map(() => false),
      fillAmount: 100,
      randomWidth: false,
      randomHeight: false,
      minCellSize: defaultMinCellSize(),
      maxCellSize: defaultMaxCellSize(base.settings.density),
      layoutSource: "imported",
    },
    blocks: result.blocks,
    imageSource: result.imageSource,
  };
}

export function createImportedFrame(
  settings: FrameSettings,
  result: ImageImportResult,
): Frame {
  return applyImageImport(
    {
      id: createId(),
      settings: structuredClone(settings),
      blocks: [],
    },
    result,
  );
}
