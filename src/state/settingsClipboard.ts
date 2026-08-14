import { isValidHex, normalizeHex } from "../colorMath";
import { MAX_COLORS } from "../config";
import { clampDensity } from "../grid/density";
import {
  DATA_FIELDS_COLOR_DEFAULT,
  DATA_FIELDS_SIZE_DEFAULT,
  DATA_FIELDS_SPAWN_DEFAULT,
  DATA_FIELDS_SPAWN_MAX,
  DATA_FIELDS_SPAWN_MIN,
  resolveDataFieldsSize,
} from "../render/dataFields";
import {
  GRID_CROSS_SIZE_DEFAULT,
  GRID_CROSS_SIZE_MAX,
  GRID_CROSS_SIZE_MIN,
  resolveGridBlendMode,
  resolveGridOverlayStroke,
} from "../render/gridOverlayParams";
import {
  TEXTURE_OVERLAY_OPACITY_DEFAULT,
  resolveTextureOverlayBlend,
} from "../render/textureOverlay";
import type {
  BackgroundMode,
  Density,
  FrameSettings,
  LayoutSource,
  MosaicBlock,
  Orientation,
  ShapePalette,
  ShapeType,
} from "../types";

const CLIPBOARD_MIME = "application/x-mozayk-settings";
const SHAPE_TYPES = new Set<ShapeType>([
  "block",
  "sphere",
  "ring",
  "triangle",
  "cross",
]);

export type SettingsClipboardPayload = {
  v: 1 | 2;
  mozayk: "settings";
  settings: FrameSettings;
  blocks?: MosaicBlock[];
  orientation?: Orientation;
};

/** Parsed copy/paste payload — blocks preserve the mosaic instead of a new scatter. */
export type SettingsClipboard = {
  settings: FrameSettings;
  blocks?: MosaicBlock[];
  orientation?: Orientation;
};

let memoryClipboard: SettingsClipboard | null = null;

function isBackground(value: string): value is BackgroundMode {
  return value === "black" || value === "transparent";
}

function isOrientation(value: unknown): value is Orientation {
  return value === "landscape" || value === "portrait" || value === "square";
}

function isLayoutSource(value: unknown): value is LayoutSource {
  return value === "procedural" || value === "imported";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseOptionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function parseColorAmounts(value: unknown, colorCount: number): number[] {
  if (!Array.isArray(value)) return equalColorAmounts(colorCount);
  const amounts = value
    .map((amount) => clampInt(amount, 0, 100, 0))
    .slice(0, colorCount);
  if (amounts.length !== colorCount) return equalColorAmounts(colorCount);
  return amounts;
}

function parseColorsLocked(value: unknown, colorCount: number): boolean[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const locked = value.map((item) => Boolean(item)).slice(0, colorCount);
  if (locked.length !== colorCount) return undefined;
  return locked;
}

function equalColorAmounts(count: number): number[] {
  if (count <= 0) return [100];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}

function parseColors(value: unknown): string[] {
  if (!Array.isArray(value)) return ["#ffffff"];
  const colors = value
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .slice(0, MAX_COLORS);
  return colors.length > 0 ? colors : ["#ffffff"];
}

function parseShapePalette(value: unknown): ShapePalette {
  if (!value || typeof value !== "object") {
    return { sphere: true, ring: true, triangle: true, cross: true };
  }
  const record = value as Record<string, unknown>;
  return {
    sphere: Boolean(record.sphere),
    ring: Boolean(record.ring),
    triangle: Boolean(record.triangle),
    cross: Boolean(record.cross),
  };
}

function parseBlocks(value: unknown): MosaicBlock[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const blocks: MosaicBlock[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const record = item as Record<string, unknown>;
    const col = Number(record.col);
    const row = Number(record.row);
    const width = Number(record.width);
    const height = Number(record.height);
    const shape = record.shape;
    const colorRaw = String(record.color ?? "");

    if (!Number.isInteger(col) || col < 0) return undefined;
    if (!Number.isInteger(row) || row < 0) return undefined;
    if (!Number.isInteger(width) || width < 1) return undefined;
    if (!Number.isInteger(height) || height < 1) return undefined;
    if (typeof shape !== "string" || !SHAPE_TYPES.has(shape as ShapeType)) {
      return undefined;
    }

    const color = isValidHex(colorRaw) ? normalizeHex(colorRaw) : colorRaw;
    if (!color) return undefined;

    blocks.push({
      col,
      row,
      width,
      height,
      shape: shape as ShapeType,
      color,
    });
  }
  return blocks;
}

function parseOptionalDensity(value: unknown): Density | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return clampDensity(n);
}

function parseSettingsRecord(candidate: Record<string, unknown>): FrameSettings | null {
  const density = clampDensity(Number(candidate.density));

  const colors = parseColors(candidate.colors);
  const colorsLocked = parseColorsLocked(candidate.colorsLocked, colors.length);
  const layoutSource = isLayoutSource(candidate.layoutSource)
    ? candidate.layoutSource
    : undefined;

  return {
    density,
    shapeMix: clampInt(candidate.shapeMix, 0, 100, 50),
    shapes: parseShapePalette(candidate.shapes),
    ringThickness: clampInt(candidate.ringThickness, 0, 100, 50),
    minCellSize: clampInt(candidate.minCellSize, 1, 999, 1),
    maxCellSize: clampInt(candidate.maxCellSize, 1, 999, 4),
    maxHeight: clampInt(candidate.maxHeight, 1, 999, 6),
    randomHeight: parseOptionalBoolean(candidate.randomHeight, true),
    maxWidth: clampInt(candidate.maxWidth, 1, 999, 6),
    randomWidth: parseOptionalBoolean(candidate.randomWidth, true),
    fillAmount: clampInt(candidate.fillAmount, 0, 100, 50),
    weight: clampInt(candidate.weight, 0, 100, 50),
    scaleBlend: clampInt(candidate.scaleBlend, 0, 6, 3),
    colors,
    colorAmounts: parseColorAmounts(candidate.colorAmounts, colors.length),
    ...(colorsLocked ? { colorsLocked } : {}),
    background: isBackground(String(candidate.background))
      ? (candidate.background as BackgroundMode)
      : "black",
    gridOverlay: Boolean(candidate.gridOverlay),
    gridOverlayDensity: parseOptionalDensity(candidate.gridOverlayDensity),
    gridOverlayColor: isValidHex(String(candidate.gridOverlayColor ?? ""))
      ? normalizeHex(String(candidate.gridOverlayColor))
      : undefined,
    gridOverlayStroke: resolveGridOverlayStroke(candidate.gridOverlayStroke),
    gridOverlayOpacity: clampInt(candidate.gridOverlayOpacity, 0, 100, 100),
    gridOverlayChaos: clampInt(candidate.gridOverlayChaos, 0, 100, 0),
    gridOverlayBlend: resolveGridBlendMode(
      candidate.gridOverlayBlend,
      candidate.gridOverlayDifference,
    ),
    gridCrosses: Boolean(candidate.gridCrosses),
    gridCrossesDensity: parseOptionalDensity(candidate.gridCrossesDensity),
    gridCrossesColor: isValidHex(String(candidate.gridCrossesColor ?? ""))
      ? normalizeHex(String(candidate.gridCrossesColor))
      : undefined,
    gridCrossesStroke: resolveGridOverlayStroke(candidate.gridCrossesStroke),
    gridCrossesSize: clampInt(
      candidate.gridCrossesSize,
      GRID_CROSS_SIZE_MIN,
      GRID_CROSS_SIZE_MAX,
      GRID_CROSS_SIZE_DEFAULT,
    ),
    gridCrossesOpacity: clampInt(candidate.gridCrossesOpacity, 0, 100, 100),
    gridCrossesChaos: clampInt(candidate.gridCrossesChaos, 0, 100, 0),
    gridCrossesBlend: resolveGridBlendMode(
      candidate.gridCrossesBlend,
      candidate.gridCrossesDifference,
    ),
    gridBlur: Boolean(candidate.gridBlur),
    gridBlurDensity: parseOptionalDensity(candidate.gridBlurDensity),
    gridBlurAmount: clampInt(candidate.gridBlurAmount, 0, 100, 50),
    gridBlurChaos: clampInt(candidate.gridBlurChaos, 0, 100, 50),
    noiseAmount: clampInt(candidate.noiseAmount, 0, 100, 0),
    hueShift: clampInt(candidate.hueShift, -180, 180, 0),
    contrast: clampInt(candidate.contrast, -100, 100, 0),
    brightness: clampInt(candidate.brightness, -100, 100, 0),
    invert: Boolean(candidate.invert),
    dataFields: Boolean(candidate.dataFields),
    dataFieldsSpawnRate: clampInt(
      candidate.dataFieldsSpawnRate,
      DATA_FIELDS_SPAWN_MIN,
      DATA_FIELDS_SPAWN_MAX,
      DATA_FIELDS_SPAWN_DEFAULT,
    ),
    dataFieldsSize: resolveDataFieldsSize(
      candidate.dataFieldsSize ?? DATA_FIELDS_SIZE_DEFAULT,
    ),
    dataFieldsColor: isValidHex(String(candidate.dataFieldsColor ?? ""))
      ? normalizeHex(String(candidate.dataFieldsColor))
      : DATA_FIELDS_COLOR_DEFAULT,
    showSourceImage: Boolean(candidate.showSourceImage),
    textureOverlayBlend: resolveTextureOverlayBlend(
      candidate.textureOverlayBlend,
    ),
    textureOverlayOpacity: clampInt(
      candidate.textureOverlayOpacity,
      0,
      100,
      TEXTURE_OVERLAY_OPACITY_DEFAULT,
    ),
    textureOverlayTint: isValidHex(String(candidate.textureOverlayTint ?? ""))
      ? normalizeHex(String(candidate.textureOverlayTint))
      : undefined,
    ...(layoutSource ? { layoutSource } : {}),
  };
}

export function parseSettingsClipboard(raw: string): SettingsClipboard | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    const candidate =
      record.settings && typeof record.settings === "object"
        ? (record.settings as Record<string, unknown>)
        : record;

    const settings = parseSettingsRecord(candidate);
    if (!settings) return null;

    const blocks = parseBlocks(record.blocks) ?? parseBlocks(candidate.blocks);
    const orientation = isOrientation(record.orientation)
      ? record.orientation
      : isOrientation(candidate.orientation)
        ? candidate.orientation
        : undefined;

    return {
      settings,
      ...(blocks ? { blocks } : {}),
      ...(orientation ? { orientation } : {}),
    };
  } catch {
    return null;
  }
}

export function serializeSettingsClipboard(
  settings: FrameSettings,
  blocks: MosaicBlock[],
  orientation: Orientation,
): string {
  const payload: SettingsClipboardPayload = {
    v: 2,
    mozayk: "settings",
    settings: structuredClone(settings),
    blocks: blocks.map((block) => ({ ...block })),
    orientation,
  };
  return JSON.stringify(payload);
}

export function copySettingsToMemory(
  settings: FrameSettings,
  blocks: MosaicBlock[],
  orientation: Orientation,
): void {
  memoryClipboard = {
    settings: structuredClone(settings),
    blocks: blocks.map((block) => ({ ...block })),
    orientation,
  };
}

export function readSettingsFromMemory(): SettingsClipboard | null {
  if (!memoryClipboard) return null;
  return {
    settings: structuredClone(memoryClipboard.settings),
    blocks: memoryClipboard.blocks?.map((block) => ({ ...block })),
    orientation: memoryClipboard.orientation,
  };
}

export async function copySettings(
  settings: FrameSettings,
  blocks: MosaicBlock[],
  orientation: Orientation,
): Promise<void> {
  copySettingsToMemory(settings, blocks, orientation);
  const text = serializeSettingsClipboard(settings, blocks, orientation);

  try {
    if (navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          [CLIPBOARD_MIME]: new Blob([text], { type: CLIPBOARD_MIME }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* memory copy still works */
  }
}

export async function readSettingsClipboard(): Promise<SettingsClipboard | null> {
  try {
    const text = await navigator.clipboard.readText();
    const parsed = parseSettingsClipboard(text);
    if (parsed) return parsed;
  } catch {
    /* fall through to memory */
  }

  return readSettingsFromMemory();
}

export function hasStoredSettings(): boolean {
  return memoryClipboard !== null;
}
