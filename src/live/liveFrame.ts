import { generateLayout, generateRandomPalette, randomizeColors } from "../layout/generateLayout";
import {
  colorAmountsForSettings,
  createDefaultSettings,
  equalColorAmounts,
  randomizeFrameCurrentColors,
  randomizeFrameLayout,
  regenerateFrameLayout,
} from "../state/frameUtils";
import type { Frame, Orientation } from "../types";
import type { LiveAction } from "./analyse";

export const LIVE_ORIENTATION: Orientation = "landscape";

function createId(): string {
  return `live-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLiveFrame(): Frame {
  const colors = generateRandomPalette(5);
  const settings = {
    ...createDefaultSettings(),
    fillAmount: 82,
    shapeMix: 100,
    shapes: { sphere: true, ring: true, triangle: true, cross: true },
    colors,
    colorAmounts: equalColorAmounts(colors.length),
    background: "#000000",
  };
  const blocks = randomizeColors(
    generateLayout(LIVE_ORIENTATION, settings),
    settings.colors,
    colorAmountsForSettings(settings),
  );
  return { id: createId(), settings, blocks };
}

export function applyLiveAction(
  frame: Frame,
  action: LiveAction,
  orientation: Orientation = LIVE_ORIENTATION,
): Frame {
  if (action === "invert") {
    if (frame.settings.invert) return frame;
    return { ...frame, settings: { ...frame.settings, invert: true } };
  }

  const cleared = frame.settings.invert
    ? { ...frame, settings: { ...frame.settings, invert: false } }
    : frame;

  if (action === "colours") {
    return randomizeFrameCurrentColors(cleared);
  }

  if (action === "all") {
    return randomizeFrameLayout(cleared, orientation);
  }

  return regenerateFrameLayout(cleared, orientation);
}
