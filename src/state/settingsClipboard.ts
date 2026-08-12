import { MAX_COLORS } from "../config";
import type { BackgroundMode, Density, FrameSettings, ShapePalette } from "../types";

const CLIPBOARD_MIME = "application/x-mosaik-settings";

export type SettingsClipboardPayload = {
  v: 1;
  mosaik: "settings";
  settings: FrameSettings;
};

let memoryClipboard: FrameSettings | null = null;

function isDensity(value: number): value is Density {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

function isBackground(value: string): value is BackgroundMode {
  return value === "black" || value === "transparent";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
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
    return { sphere: false, ring: false, triangle: false };
  }
  const record = value as Record<string, unknown>;
  return {
    sphere: Boolean(record.sphere),
    ring: Boolean(record.ring),
    triangle: Boolean(record.triangle),
  };
}

export function parseSettingsClipboard(raw: string): FrameSettings | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    const candidate =
      record.settings && typeof record.settings === "object"
        ? (record.settings as Record<string, unknown>)
        : record;

    const density = Number(candidate.density);
    if (!isDensity(density)) return null;

    const colors = parseColors(candidate.colors);
    const colorsLocked = parseColorsLocked(candidate.colorsLocked, colors.length);

    return {
      density,
      shapeMix: clampInt(candidate.shapeMix, 0, 100, 50),
      shapes: parseShapePalette(candidate.shapes),
      ringThickness: clampInt(candidate.ringThickness, 0, 100, 45),
      minCellSize: clampInt(candidate.minCellSize, 1, 999, 1),
      maxCellSize: clampInt(candidate.maxCellSize, 1, 999, 4),
      maxHeight: clampInt(candidate.maxHeight, 1, 999, 6),
      randomHeight: Boolean(candidate.randomHeight),
      maxWidth: clampInt(candidate.maxWidth, 1, 999, 6),
      randomWidth: Boolean(candidate.randomWidth),
      fillAmount: clampInt(candidate.fillAmount, 0, 100, 85),
      weight: clampInt(candidate.weight, 0, 100, 50),
      scaleBlend: clampInt(candidate.scaleBlend, 1, 6, 3),
      colors,
      colorAmounts: parseColorAmounts(candidate.colorAmounts, colors.length),
      ...(colorsLocked ? { colorsLocked } : {}),
      background: isBackground(String(candidate.background))
        ? (candidate.background as BackgroundMode)
        : "black",
      showSourceImage: Boolean(candidate.showSourceImage),
    };
  } catch {
    return null;
  }
}

export function serializeSettingsClipboard(
  settings: FrameSettings,
): string {
  const payload: SettingsClipboardPayload = {
    v: 1,
    mosaik: "settings",
    settings: structuredClone(settings),
  };
  return JSON.stringify(payload);
}

export function copySettingsToMemory(settings: FrameSettings): void {
  memoryClipboard = structuredClone(settings);
}

export function readSettingsFromMemory(): FrameSettings | null {
  return memoryClipboard ? structuredClone(memoryClipboard) : null;
}

export async function copySettings(settings: FrameSettings): Promise<void> {
  copySettingsToMemory(settings);
  const text = serializeSettingsClipboard(settings);

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

export async function readSettingsClipboard(): Promise<FrameSettings | null> {
  const fromMemory = readSettingsFromMemory();
  if (fromMemory) return fromMemory;

  try {
    const text = await navigator.clipboard.readText();
    return parseSettingsClipboard(text);
  } catch {
    return null;
  }
}

export function hasStoredSettings(): boolean {
  return memoryClipboard !== null;
}
