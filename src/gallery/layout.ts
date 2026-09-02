import { RATIO_VALUE, type Distribution, type Ratio } from "./types";

const SHORT_SIDE = 1.85;
const MIN_RADIUS = 3.35;
const GAP_PAD = 0.1;

export function itemSize(ratio: Ratio): { width: number; height: number } {
  const aspect = RATIO_VALUE[ratio];
  if (aspect >= 1) {
    return { width: SHORT_SIDE * aspect, height: SHORT_SIDE };
  }
  return { width: SHORT_SIDE, height: SHORT_SIDE / aspect };
}

export function itemGap(width: number): number {
  return width * 0.07 + GAP_PAD;
}

export function ringRadius(count: number, ratio: Ratio): number {
  if (count <= 0) return MIN_RADIUS;
  const { width } = itemSize(ratio);
  const pitch = width + itemGap(width);
  return Math.max(MIN_RADIUS, (count * pitch) / (Math.PI * 2));
}

const FLOOR_GAP = 0.45;

export function floorPitch(ratio: Ratio): number {
  return itemSize(ratio).height + FLOOR_GAP;
}

export function floorY(index: number, ratio: Ratio): number {
  return index * floorPitch(ratio);
}

/** Center angle of each slot, 0 = in front of the camera (−Z). Always faces a panel, not a gap. */
export function slotAngles(
  count: number,
  ratio: Ratio,
  radius: number,
  distribution: Distribution = "cluster",
): number[] {
  if (count <= 0) return [];
  if (distribution === "ring") {
    const step = (Math.PI * 2) / count;
    return Array.from({ length: count }, (_, i) => i * step);
  }
  const { width } = itemSize(ratio);
  const pitch = (width + itemGap(width)) / Math.max(radius, 0.001);
  const start =
    -((count - 1) * pitch) / 2 + (count % 2 === 0 ? pitch / 2 : 0);
  return Array.from({ length: count }, (_, i) => start + i * pitch);
}
