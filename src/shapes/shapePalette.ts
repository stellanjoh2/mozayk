import type { FrameSettings, ShapeType } from "../types";

export type Rng = () => number;

export type OptionalShape = Exclude<ShapeType, "block">;

export const OPTIONAL_SHAPES: OptionalShape[] = ["sphere", "ring"];

export function getShapePool(settings: FrameSettings): ShapeType[] {
  const pool: ShapeType[] = ["block"];
  if (settings.shapes.sphere) pool.push("sphere");
  if (settings.shapes.ring) pool.push("ring");
  return pool;
}

function pickInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

export function assignShape(settings: FrameSettings, rng: Rng = Math.random): ShapeType {
  const pool = getShapePool(settings);
  if (pool.length === 1) return "block";

  const mix = settings.shapeMix;
  if (mix <= 0) return "block";
  if (mix >= 100) {
    return pool[pickInt(rng, 0, pool.length - 1)] ?? "block";
  }

  const t = mix / 100;
  if (rng() > t) return "block";

  const optional = pool.filter((shape) => shape !== "block");
  if (optional.length === 0) return "block";
  return optional[pickInt(rng, 0, optional.length - 1)] ?? "block";
}
