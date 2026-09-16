import { toCustomShapeRef } from "./customShapes";
import type { BuiltinShapeType, FrameSettings, ShapeType } from "../types";

export type Rng = () => number;

/** Shapes that appear as toggles under Add Shapes (boxes handled separately). */
export type OptionalShape = Exclude<BuiltinShapeType, "block" | "cross">;

export const OPTIONAL_SHAPES: OptionalShape[] = [
  "sphere",
  "ring",
  "triangle",
  "clover",
  "dots",
  "spots",
  "arcs",
  "quads",
  "checks",
  "wedges",
  "ex",
  "star",
  "bloom",
  "flower",
  "blossom",
  "moons",
  "steps",
  "chevrons",
  "gates",
  "waves",
  "arches",
  "tiles",
  "scallops",
];

export function anyOptionalShapeEnabled(
  shapes: FrameSettings["shapes"],
  customShapes: FrameSettings["customShapes"] = undefined,
): boolean {
  if (OPTIONAL_SHAPES.some((shape) => shapes[shape])) return true;
  return Boolean(
    customShapes?.some((slot) => slot.enabled && Boolean(slot.dataUrl)),
  );
}

export function getShapePool(settings: FrameSettings): ShapeType[] {
  const pool: ShapeType[] = [];
  if (settings.shapes.block) pool.push("block");
  for (const shape of OPTIONAL_SHAPES) {
    if (settings.shapes[shape]) pool.push(shape);
  }
  for (const slot of settings.customShapes ?? []) {
    if (slot.enabled && slot.dataUrl) {
      pool.push(toCustomShapeRef(slot.id));
    }
  }
  // Never leave the pool empty — boxes are the safe fallback.
  return pool.length > 0 ? pool : ["block"];
}

function pickInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

export function assignShape(
  settings: FrameSettings,
  rng: Rng = Math.random,
): ShapeType {
  // Triangles may land on any cell; renderers keep them square via the
  // inscribed min(width, height) so they never stretch.
  const pool = getShapePool(settings);
  if (pool.length === 1) return pool[0]!;

  const hasBlock = pool.includes("block");
  const optional = pool.filter((shape) => shape !== "block");
  if (!hasBlock) {
    return optional[pickInt(rng, 0, optional.length - 1)]!;
  }
  if (optional.length === 0) return "block";

  const mix = settings.shapeMix;
  if (mix <= 0) return "block";

  if (mix >= 100) {
    return optional[pickInt(rng, 0, optional.length - 1)] ?? "block";
  }

  const t = mix / 100;
  if (rng() > t) return "block";

  return optional[pickInt(rng, 0, optional.length - 1)] ?? "block";
}
