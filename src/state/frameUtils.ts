import { MAX_COLORS } from "../config";
import {
  defaultMaxCellSize,
  defaultMinCellSize,
  gridScale,
  isDensityOff,
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
  amountsFromCounts,
  buildMergedLayoutFromColorGrid,
  buildMergedLayoutFromImage,
  coverCropBlocks,
  coverCropColorGrid,
  gridExtentsFromBlocks,
  nearestPaletteIndex,
  rasterizeBlockColorGrid,
} from "../import/imageImport";
import type { ImageImportResult } from "../import/imageImport";
import { getCachedSourceImage } from "../import/imageSource";
import type { ImageSourceData } from "../import/imageSource";
import {
  importColorCount,
  maxImportColorCount,
  MIN_IMPORT_COLOR_COUNT,
  reducedImportPalette,
  reducedPhotoColors,
  themeIndicesForSlots,
} from "../import/reducePalette";
import { hexToRgb } from "../colorMath";
import { OPTIONAL_SHAPES } from "../shapes/shapePalette";
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
  return {
    block: true,
    sphere: false,
    ring: false,
    triangle: false,
    cross: false,
    clover: false,
    dots: false,
    spots: false,
    arcs: false,
    quads: false,
    checks: false,
    wedges: false,
    ex: false,
    star: false,
    bloom: false,
    flower: false,
    blossom: false,
    moons: false,
    steps: false,
    chevrons: false,
    gates: false,
    waves: false,
    arches: false,
    tiles: false,
    scallops: false,
    rays: false,
    targets: false,
    pluses: false,
  };
}

export function equalColorAmounts(count: number): number[] {
  if (count <= 0) return [100];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}

/**
 * Set one Amount and scale the others from `base` so the total stays 100.
 * If the others in `base` are all 0, the freed share splits evenly.
 */
export function redistributeAmounts(
  base: number[],
  index: number,
  amount: number,
): number[] {
  const target = Math.max(0, Math.min(100, Math.round(amount)));
  const otherCount = base.length - 1;
  if (otherCount <= 0) return [100];
  const others = base.reduce(
    (sum, value, i) => (i === index ? sum : sum + Math.max(0, value)),
    0,
  );
  const remaining = 100 - target;
  const exact = base.map((value, i) => {
    if (i === index) return target;
    return others > 0
      ? (Math.max(0, value) / others) * remaining
      : remaining / otherCount;
  });
  const rounded = exact.map((value) => Math.round(value));
  const drift = 100 - rounded.reduce((sum, value) => sum + value, 0);
  if (drift !== 0) {
    let fix = -1;
    exact.forEach((value, i) => {
      if (i !== index && (fix < 0 || value > exact[fix]!)) fix = i;
    });
    rounded[fix] = Math.max(0, rounded[fix]! + drift);
  }
  return rounded;
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

export function createDefaultSettings(): FrameSettings {
  const density = 4 as Density;
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
    fillAmount: 10,
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

function settingsKeyChanged<K extends keyof FrameSettings>(
  keys: readonly K[],
  from: FrameSettings,
  to: FrameSettings,
): boolean {
  return keys.some((key) => from[key] !== to[key]);
}

function customShapesChanged(
  from: FrameSettings["customShapes"],
  to: FrameSettings["customShapes"],
): boolean {
  const left = from ?? [];
  const right = to ?? [];
  if (left.length !== right.length) return true;
  return left.some((slot, index) => {
    const other = right[index];
    return (
      !other ||
      slot.id !== other.id ||
      slot.enabled !== other.enabled ||
      slot.dataUrl !== other.dataUrl
    );
  });
}

function shapeSettingsChanged(from: FrameSettings, to: FrameSettings): boolean {
  if (from.shapeMix !== to.shapeMix) return true;
  if (customShapesChanged(from.customShapes, to.customShapes)) return true;
  const fromShapes = from.shapes ?? createDefaultShapePalette();
  const toShapes = to.shapes ?? createDefaultShapePalette();
  return OPTIONAL_SHAPES.some(
    (shape) => fromShapes[shape] !== toShapes[shape],
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
    // Theme / threshold only — applyLook never copies the picture bytes.
    imageSource: frame.imageSource
      ? {
          dataUrl: frame.imageSource.dataUrl,
          palette: [...frame.imageSource.palette],
          paletteRgb: frame.imageSource.paletteRgb.map((rgb) => ({ ...rgb })),
          ...(frame.imageSource.paletteWeights
            ? { paletteWeights: [...frame.imageSource.paletteWeights] }
            : {}),
          ...(frame.imageSource.themeColors
            ? { themeColors: [...frame.imageSource.themeColors] }
            : {}),
          ...(typeof frame.imageSource.colorCount === "number"
            ? { colorCount: frame.imageSource.colorCount }
            : {}),
          ...(frame.imageSource.fit ? { fit: frame.imageSource.fit } : {}),
        }
      : undefined,
  };
}

/**
 * Full photo palette, no theme / threshold — the baseline before applying a
 * look (same starting point as a fresh import).
 */
function resetImportedFrameToPhoto(frame: Frame): Frame {
  const source = frame.imageSource;
  if (!source || source.paletteRgb.length === 0) return frame;
  const { themeColors: _theme, colorCount: _count, ...imageSource } = source;
  const colors = imageSource.palette.slice(0, MAX_COLORS);
  if (colors.length === 0) return frame;
  const blocks = frame.blocks.map((block) => {
    const idx = nearestPaletteIndex(
      hexToRgb(block.color),
      imageSource.paletteRgb,
    );
    const color = colors[Math.min(idx, colors.length - 1)] ?? block.color;
    return color === block.color ? block : { ...block, color };
  });
  return {
    ...frame,
    imageSource,
    settings: {
      ...frame.settings,
      colors,
      colorAmounts: importedColorAmounts(imageSource, colors.length),
      colorsLocked: colors.map(() => false),
    },
    blocks,
  };
}

/**
 * Paint photo-coloured tiles with `toColors` at the look's threshold.
 * Classifies each tile by its photo-palette slot → reduced centre → swatch.
 */
function recolorPhotoBlocksToLook(
  blocks: MosaicBlock[],
  photoSource: ImageSourceData,
  toSource: ImageSourceData,
  toColors: string[],
): MosaicBlock[] {
  if (toColors.length === 0) return blocks;
  const photoRgb = photoSource.paletteRgb;
  const photoPalette = photoSource.palette;
  const newCenters = reducedImportPalette(toSource).centers;
  if (newCenters.length === 0 || photoRgb.length === 0) return blocks;

  return blocks.map((block) => {
    const photoIndex = photoPalette.indexOf(block.color);
    const center =
      photoIndex >= 0 && photoIndex < photoRgb.length
        ? photoRgb[photoIndex]!
        : photoRgb[nearestPaletteIndex(hexToRgb(block.color), photoRgb)]!;
    const color =
      toColors[
        Math.min(nearestPaletteIndex(center, newCenters), toColors.length - 1)
      ] ?? toColors[0]!;
    return color === block.color ? block : { ...block, color };
  });
}

/**
 * Density / fill / scale-blend must match tile coordinates or the mosaic
 * paints into a corner of the canvas (higher density + old tiles).
 */
function withDestinationImportedLayout(
  settings: FrameSettings,
  destination: FrameSettings,
): FrameSettings {
  return {
    ...settings,
    density: destination.density,
    fillAmount: destination.fillAmount,
    scaleBlend: destination.scaleBlend,
  };
}

/** Remesh from the photo, or fall back to layout knobs that match existing tiles. */
function ensureImportedGeometryMatchesSettings(
  frame: Frame,
  orientation: Orientation,
  layoutFallback: FrameSettings,
): Frame {
  if (!frame.imageSource || isDensityOff(frame.settings.density)) return frame;
  const { columns, rows } = getGridCounts(orientation, frame.settings.density);
  if (columns <= 0 || rows <= 0) return frame;
  const ext = gridExtentsFromBlocks(frame.blocks);
  if (ext.columns === columns && ext.rows === rows) return frame;

  if (getCachedSourceImage(frame.imageSource.dataUrl)) {
    return relayoutImportedFrame(frame, orientation, frameLayoutRng(frame));
  }
  return {
    ...frame,
    settings: withDestinationImportedLayout(frame.settings, layoutFallback),
  };
}

/**
 * Copy style from `look` onto `frame`. Keeps this frame's picture.
 *
 * Imports always reset to the full photo palette first, then re-apply the
 * look's theme/threshold/swatches — same sequence as editing frame 1. Remapping
 * from an already-reduced palette was what broke paste / apply-look.
 */
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

  const overlays = {
    textureOverlay: look.textureOverlay
      ? structuredClone(look.textureOverlay)
      : undefined,
    backgroundImage: look.backgroundImage
      ? structuredClone(look.backgroundImage)
      : undefined,
  };

  if (frame.imageSource && look.imageSource) {
    const lookColors = [...look.settings.colors];
    if (lookColors.length < MIN_IMPORT_COLOR_COUNT) {
      return { ...frame, settings, ...overlays };
    }

    const layoutChanged = settingsKeyChanged(
      IMPORTED_LAYOUT_SETTING_KEYS,
      frame.settings,
      settings,
    );

    // Idempotent fast path: already on this look's swatches + threshold.
    if (
      frame.settings.colors.length === lookColors.length &&
      frame.settings.colors.every((c, i) => c === lookColors[i]) &&
      importColorCount(frame.imageSource) === lookColors.length
    ) {
      let next: Frame = {
        ...frame,
        settings: {
          ...settings,
          colors: frame.settings.colors,
          colorAmounts:
            look.settings.colorAmounts?.length === lookColors.length
              ? [...look.settings.colorAmounts]
              : frame.settings.colorAmounts,
          colorsLocked:
            look.settings.colorsLocked?.length === lookColors.length
              ? [...look.settings.colorsLocked]
              : frame.settings.colorsLocked,
        },
        ...overlays,
      };
      if (layoutChanged) {
        if (getCachedSourceImage(frame.imageSource.dataUrl)) {
          next = relayoutImportedFrame(
            next,
            orientation,
            frameLayoutRng(frame),
          );
        } else {
          next = {
            ...next,
            settings: withDestinationImportedLayout(
              next.settings,
              frame.settings,
            ),
          };
        }
      } else if (shapeSettingsChanged(frame.settings, next.settings)) {
        next = { ...next, blocks: rerollShapes(frame.blocks, next.settings) };
      }
      return ensureImportedGeometryMatchesSettings(
        next,
        orientation,
        frame.settings,
      );
    }

    const photoBase = resetImportedFrameToPhoto(frame);
    const photoSource = photoBase.imageSource!;
    let next: Frame = {
      ...photoBase,
      settings: {
        ...settings,
        colors: photoBase.settings.colors,
        colorAmounts: photoBase.settings.colorAmounts,
        colorsLocked: photoBase.settings.colorsLocked,
      },
      ...overlays,
    };

    const lookTheme = look.imageSource.themeColors;
    if (lookTheme && lookTheme.length >= MIN_IMPORT_COLOR_COUNT) {
      next = applyThemeToImportedFrame(next, lookTheme, orientation);
    }

    if (
      lookColors.length !== next.settings.colors.length ||
      lookColors.length !== importColorCount(next.imageSource!)
    ) {
      next = setImportColorCount(next, lookColors.length, orientation);
    }

    const colorAmounts =
      look.settings.colorAmounts?.length === lookColors.length
        ? [...look.settings.colorAmounts]
        : next.settings.colorAmounts;
    const colorsLocked =
      look.settings.colorsLocked?.length === lookColors.length
        ? [...look.settings.colorsLocked]
        : lookColors.map(
            (_, index) =>
              look.settings.colorsLocked?.[
                Math.min(index, (look.settings.colorsLocked?.length ?? 1) - 1)
              ] ?? false,
          );

    if (getCachedSourceImage(frame.imageSource.dataUrl)) {
      next = {
        ...next,
        settings: {
          ...next.settings,
          colors: lookColors,
          colorAmounts,
          colorsLocked,
        },
      };
      next = relayoutImportedFrame(next, orientation, frameLayoutRng(frame));
    } else {
      // No photo in cache: recolor in place. Keep this frame's layout knobs
      // when the look would change them — density without a remesh shrinks
      // the mosaic into the top-left corner of the canvas.
      let imageSource = next.imageSource!;
      if (lookColors.length < imageSource.paletteRgb.length) {
        imageSource = { ...imageSource, colorCount: lookColors.length };
      } else {
        const { colorCount: _c, ...rest } = imageSource;
        imageSource = rest;
      }
      if (lookTheme && lookTheme.length >= lookColors.length) {
        imageSource = { ...imageSource, themeColors: [...lookTheme] };
      }
      const nextSettings = layoutChanged
        ? withDestinationImportedLayout(next.settings, frame.settings)
        : next.settings;
      next = {
        ...next,
        imageSource,
        settings: {
          ...nextSettings,
          colors: lookColors,
          colorAmounts,
          colorsLocked,
        },
        blocks: recolorPhotoBlocksToLook(
          photoBase.blocks,
          photoSource,
          imageSource,
          lookColors,
        ),
      };
    }

    if (shapeSettingsChanged(frame.settings, next.settings)) {
      next = { ...next, blocks: rerollShapes(next.blocks, next.settings) };
    }
    return ensureImportedGeometryMatchesSettings(
      next,
      orientation,
      frame.settings,
    );
  }

  let next: Frame = {
    ...frame,
    settings,
    blocks: frame.blocks,
    ...overlays,
  };

  if (settingsKeyChanged(LAYOUT_SETTING_KEYS, frame.settings, settings)) {
    return regenerateFrameLayout(next, orientation);
  }

  next = {
    ...next,
    blocks: remapBlockColors(
      frame.blocks,
      frame.settings.colors,
      settings.colors,
    ),
  };
  if (shapeSettingsChanged(frame.settings, next.settings)) {
    next = { ...next, blocks: rerollShapes(next.blocks, next.settings) };
  }
  return next;
}

export function applyLookToAllFrames(
  frames: Frame[],
  sourceIndex: number,
  orientation: Orientation,
): Frame[] {
  const look = frames[sourceIndex];
  if (!look || frames.length <= 1) return frames;
  return frames.map((frame, index) =>
    index === sourceIndex
      ? frame
      : applyLookToFrame(frame, look, orientation),
  );
}

/** Sorted unique indices that fall inside `length`. */
export function normalizeFrameIndices(
  indices: number[],
  length: number,
): number[] {
  return [
    ...new Set(
      indices.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < length,
      ),
    ),
  ].sort((a, b) => a - b);
}

/** Insert a duplicate after each selected index (end→start so earlier slots stay put). */
export function duplicateFramesAt(
  frames: Frame[],
  indices: number[],
  maxFrames: number,
): { frames: Frame[]; activeIndex: number } {
  const sorted = normalizeFrameIndices(indices, frames.length);
  if (sorted.length === 0 || frames.length >= maxFrames) {
    return { frames, activeIndex: Math.max(0, frames.length - 1) };
  }

  const next = [...frames];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (next.length >= maxFrames) break;
    const index = sorted[i]!;
    next.splice(index + 1, 0, duplicateFrame(next[index]!));
  }

  return {
    frames: next,
    activeIndex: Math.min(sorted[0]! + 1, next.length - 1),
  };
}

/** Drop selected frames, always leaving at least one. */
export function removeFramesAt(
  frames: Frame[],
  indices: number[],
): { frames: Frame[]; activeIndex: number } {
  if (frames.length <= 1) return { frames, activeIndex: 0 };

  const toRemove = new Set(normalizeFrameIndices(indices, frames.length));
  if (toRemove.size === 0) {
    return { frames, activeIndex: Math.max(0, frames.length - 1) };
  }
  // Never delete the whole timeline — keep the earliest frame.
  if (toRemove.size >= frames.length) {
    toRemove.delete(0);
  }

  const firstRemoved = Math.min(...toRemove);
  const next = frames.filter((_, index) => !toRemove.has(index));
  return {
    frames: next,
    activeIndex: Math.min(firstRemoved, next.length - 1),
  };
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

/** Each reduced slot's share of the image, as Amount values (sum 100). */
function importNaturalAmounts(source: ImageSourceData): number[] {
  return amountsFromCounts(reducedImportPalette(source).weights);
}

/** Amount values for an imported frame: each slot's share of the image. */
function importedColorAmounts(source: ImageSourceData, length: number): number[] {
  if (source.paletteWeights) {
    const natural = importNaturalAmounts(source);
    if (natural.length === length) return natural;
  }
  return equalColorAmounts(length);
}

/** Same seed per frame so slider drags only move colour regions, not every shape. */
function frameLayoutRng(frame: Frame): () => number {
  let seed = 0;
  for (let i = 0; i < frame.id.length; i++) {
    seed = (Math.imul(seed, 31) + frame.id.charCodeAt(i)) | 0;
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  // Always resample from the original photo when it is loaded. Scaling the
  // current mosaic (the old same-ratio path) permanently lost detail.
  const image = getCachedSourceImage(frame.imageSource.dataUrl);
  if (image) {
    const blocks = buildMergedLayoutFromImage(
      image,
      orientation,
      settings,
      displayPalette,
      reducedImportPalette(frame.imageSource).centers,
      rng,
      frame.imageSource.fit ?? "cover",
    );
    return dropOrientationLayout({ ...frame, settings, blocks });
  }

  const { columns, rows } = getGridCounts(orientation, settings.density);
  const oldExtents = gridExtentsFromBlocks(frame.blocks);
  const gridSizeChanged =
    oldExtents.columns > 0 &&
    oldExtents.rows > 0 &&
    (oldExtents.columns !== columns || oldExtents.rows !== rows);

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

  // When the source photo is loaded, re-sample into the new ratio. Cover-cropping
  // tiles permanently loses the parts of the photo that were cropped away
  // (and contain-fit letterboxing would clip subject pixels).
  if (
    frame.imageSource &&
    getCachedSourceImage(frame.imageSource.dataUrl)
  ) {
    return relayoutImportedFrame(
      { ...frame, settings, blocks: sourceBlocks, orientationLayout: source },
      to,
    );
  }

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
  orientation: Orientation,
): Frame {
  const colors = preset.colors.slice(0, MAX_COLORS);
  if (frame.imageSource && frame.imageSource.paletteRgb.length > 0) {
    return applyThemeToImportedFrame(frame, colors, orientation);
  }
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
  const blocks = randomizeColors(
    frame.blocks,
    colors,
    colorAmounts,
    Math.random,
    colorsLocked,
  );
  return { ...frame, settings, blocks };
}

/** True when an import exists and the working palette differs from the photo's. */
export function canRestorePhotoColors(frame: Frame): boolean {
  if (!frame.imageSource) return false;
  const photo = reducedPhotoColors(frame.imageSource);
  if (photo.length === 0) return false;
  const current = frame.settings.colors;
  if (current.length !== photo.length) return true;
  return current.some((color, index) => color !== photo[index]);
}

/** Put the photo-extracted palette back, remapping slots (same path as themes). */
export function restorePhotoColorsToFrame(frame: Frame): Frame {
  if (!canRestorePhotoColors(frame) || !frame.imageSource) return frame;
  const { themeColors: _theme, ...imageSource } = frame.imageSource;
  const colors = reducedPhotoColors(imageSource).slice(0, MAX_COLORS);
  if (colors.length === 0) return frame;
  const colorAmounts = importedColorAmounts(imageSource, colors.length);
  const colorsLocked = colors.map(() => false);
  const settings: FrameSettings = {
    ...frame.settings,
    colors,
    colorAmounts,
    colorsLocked,
  };
  const blocks = remapBlockColors(frame.blocks, frame.settings.colors, colors);
  return { ...frame, imageSource, settings, blocks };
}

/** Theme index per slot at the source's current threshold. */
function themeSlotIndices(source: ImageSourceData, theme: string[]): number[] {
  return themeIndicesForSlots(
    reducedImportPalette(source).centers,
    theme.map((hex) => hexToRgb(hex)),
  );
}

/**
 * Fold swatch edits made since the theme was applied back into it, so the
 * threshold keeps working from what is on screen. A changed colour count
 * (add/remove/paste) makes the current swatches the new theme.
 */
function themeWithSwatchEdits(frame: Frame, theme: string[]): string[] {
  const source = frame.imageSource!;
  const current = frame.settings.colors;
  const slots = themeSlotIndices(source, theme);
  if (slots.length !== current.length) return current.slice();
  const next = theme.slice();
  slots.forEach((themeIndex, slot) => {
    next[themeIndex] = current[slot]!;
  });
  return next;
}

/** Re-pick slot colours from the theme for the current threshold and rebuild. */
function recolorFromTheme(
  frame: Frame,
  imageSource: ImageSourceData,
  theme: string[],
  lockedByTheme: Map<number, boolean>,
  orientation?: Orientation,
): Frame {
  const slots = themeSlotIndices(imageSource, theme);
  const colors = slots.map((index) => theme[index]!);
  const settings: FrameSettings = {
    ...frame.settings,
    colors,
    colorAmounts: importNaturalAmounts(imageSource),
    colorsLocked: slots.map((index) => lockedByTheme.get(index) ?? false),
  };
  const blocks = frame.imageSource
    ? remapBlocksAcrossThresholds(frame.blocks, frame, imageSource, colors)
    : frame.blocks;
  const next = { ...frame, imageSource, settings, blocks };
  return orientation
    ? relayoutImportedFrame(next, orientation, frameLayoutRng(frame))
    : next;
}

/** Old slot → whichever new group its colour centre now falls in. */
function remapBlocksAcrossThresholds(
  blocks: MosaicBlock[],
  frame: Frame,
  nextSource: ImageSourceData,
  nextColors: string[],
): MosaicBlock[] {
  const oldCenters = reducedImportPalette(frame.imageSource!).centers;
  const newCenters = reducedImportPalette(nextSource).centers;
  const oldColors = frame.settings.colors;
  return blocks.map((block) => {
    const slot = oldColors.indexOf(block.color);
    const center = oldCenters[Math.min(Math.max(slot, 0), oldCenters.length - 1)];
    if (!center) return block;
    const color = nextColors[nearestPaletteIndex(center, newCenters)] ?? block.color;
    return color === block.color ? block : { ...block, color };
  });
}

/** Themes on imported frames drive the slots by tone, at any threshold. */
function applyThemeToImportedFrame(
  frame: Frame,
  theme: string[],
  orientation: Orientation,
): Frame {
  const source = frame.imageSource!;
  if (theme.length < MIN_IMPORT_COLOR_COUNT) {
    const { themeColors: _theme, ...rest } = source;
    const colors = theme.slice();
    return {
      ...frame,
      imageSource: rest,
      settings: {
        ...frame.settings,
        colors,
        colorAmounts: equalColorAmounts(colors.length),
        colorsLocked: colors.map(() => false),
      },
      blocks: remapBlockColors(frame.blocks, frame.settings.colors, colors),
    };
  }
  const { colorCount: _count, ...rest } = source;
  const themed: ImageSourceData = { ...rest, themeColors: theme };
  const count = Math.min(importColorCount(source), maxImportColorCount(themed));
  const imageSource =
    count >= source.paletteRgb.length ? themed : { ...themed, colorCount: count };
  // Same slots as on screen: recolour in place. Otherwise the tiles no longer
  // match the groups and must be rebuilt from the image.
  const slotsUnchanged =
    count === importColorCount(source) &&
    frame.settings.colors.length === count;
  return recolorFromTheme(
    frame,
    imageSource,
    theme,
    new Map(),
    slotsUnchanged ? undefined : orientation,
  );
}

/** Slider range for merging image colours, or null when the frame has no import. */
export function importColorCountRange(
  frame: Frame,
): { min: number; max: number; value: number } | null {
  const source = frame.imageSource;
  if (!source) return null;
  const max = maxImportColorCount(source);
  if (max <= MIN_IMPORT_COLOR_COUNT) return null;
  return {
    min: MIN_IMPORT_COLOR_COUNT,
    max,
    value: importColorCount(source),
  };
}

/**
 * Merge the image's colours down (or back up) to `count` and rebuild from the image.
 * With a theme, slots re-pick from the theme by tone. Otherwise each merged group
 * keeps the display colour, lock and slot of its heaviest member.
 */
export function setImportColorCount(
  frame: Frame,
  count: number,
  orientation: Orientation,
): Frame {
  const source = frame.imageSource;
  if (!source || source.paletteRgb.length === 0) return frame;

  const withCount = (base: ImageSourceData): ImageSourceData => {
    const max = maxImportColorCount(base);
    const clamped = Math.max(
      Math.min(MIN_IMPORT_COLOR_COUNT, max),
      Math.min(max, Math.round(count)),
    );
    const { colorCount: _previousCount, ...rest } = base;
    return clamped >= base.paletteRgb.length ? rest : { ...rest, colorCount: clamped };
  };

  if (source.themeColors) {
    const previousSlots = themeSlotIndices(source, source.themeColors);
    const theme = themeWithSwatchEdits(frame, source.themeColors);
    const lockedByTheme = new Map<number, boolean>();
    if (previousSlots.length === frame.settings.colors.length) {
      previousSlots.forEach((themeIndex, slot) => {
        lockedByTheme.set(themeIndex, frame.settings.colorsLocked?.[slot] ?? false);
      });
    }
    if (theme.length >= MIN_IMPORT_COLOR_COUNT) {
      const imageSource = withCount({ ...source, themeColors: theme });
      return recolorFromTheme(frame, imageSource, theme, lockedByTheme, orientation);
    }
  }

  const previous = reducedImportPalette(source);
  const displayByRep = new Map<number, string>();
  const lockedByRep = new Map<number, boolean>();
  previous.representatives.forEach((rep, slot) => {
    const color = frame.settings.colors[slot];
    if (color) displayByRep.set(rep, color);
    lockedByRep.set(rep, frame.settings.colorsLocked?.[slot] ?? false);
  });

  const { themeColors: _theme, ...untinted } = source;
  const imageSource = withCount(untinted);
  const next = reducedImportPalette(imageSource);

  const colors = next.representatives.map(
    (rep) => displayByRep.get(rep) ?? source.palette[rep] ?? "#000000",
  );
  const settings: FrameSettings = {
    ...frame.settings,
    colors,
    colorAmounts: amountsFromCounts(next.weights),
    colorsLocked: next.representatives.map((rep) => lockedByRep.get(rep) ?? false),
  };
  return relayoutImportedFrame(
    { ...frame, imageSource, settings },
    orientation,
    frameLayoutRng(frame),
  );
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

  if (gridScale(settings.density) === 0 || gridScale(newDensity) === 0) {
    return {
      ...settings,
      density: newDensity,
      minCellSize: defaultMinCellSize(),
      maxCellSize: defaultMaxCellSize(newDensity),
    };
  }

  const ratio = gridScale(newDensity) / gridScale(settings.density);
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
  if (maxSpan <= 0 || maxRow <= 0) {
    return {
      ...settings,
      minCellSize: defaultMinCellSize(),
      maxCellSize: defaultMaxCellSize(settings.density),
    };
  }
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
  orientation: Orientation,
): Frame {
  const base = dropOrientationLayout(frame);
  const layout = settingsForImageImport(base.settings, orientation);
  return {
    ...base,
    settings: {
      ...layout,
      colors: result.colors,
      colorAmounts: result.colorAmounts,
      colorsLocked: result.colors.map(() => false),
      layoutSource: "imported",
    },
    blocks: result.blocks,
    imageSource: result.imageSource,
  };
}

export function createImportedFrame(
  settings: FrameSettings,
  result: ImageImportResult,
  orientation: Orientation,
): Frame {
  return applyImageImport(
    {
      id: createId(),
      settings: structuredClone(settings),
      blocks: [],
    },
    result,
    orientation,
  );
}

/** Drop prior Scale Blend / max-span tweaks so a new photo isn't built oversized. */
export function settingsForImageImport(
  settings: FrameSettings,
  orientation: Orientation,
): FrameSettings {
  const density = settings.density;
  const heightMax = maxHeightSliderMax(density, orientation);
  const widthMax = maxWidthSliderMax(density, orientation);
  return {
    ...settings,
    scaleBlend: 3,
    minCellSize: defaultMinCellSize(),
    maxCellSize: defaultMaxCellSize(density),
    maxHeight: Math.max(1, Math.round(heightMax / 2)),
    maxWidth: Math.max(1, Math.round(widthMax / 2)),
    randomHeight: false,
    randomWidth: false,
    fillAmount: 100,
  };
}
