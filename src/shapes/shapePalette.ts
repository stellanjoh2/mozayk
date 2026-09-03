import type { FrameSettings, ShapeType } from "../types";

export type Rng = () => number;

export type OptionalShape = Exclude<ShapeType, "block">;

export const OPTIONAL_SHAPES: OptionalShape[] = [
  "sphere",
  "ring",
  "triangle",
  "cross",
  "clover",
  "arrows",
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
];

export function anyOptionalShapeEnabled(
  shapes: FrameSettings["shapes"],
): boolean {
  return OPTIONAL_SHAPES.some((shape) => shapes[shape]);
}

export function getShapePool(settings: FrameSettings): ShapeType[] {
  const pool: ShapeType[] = ["block"];
  for (const shape of OPTIONAL_SHAPES) {
    if (settings.shapes[shape]) pool.push(shape);
  }
  return pool;
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
  if (pool.length === 1) return "block";

  const mix = settings.shapeMix;
  if (mix <= 0) return "block";

  const optional = pool.filter((shape) => shape !== "block");
  if (optional.length === 0) return "block";

  if (mix >= 100) {
    return optional[pickInt(rng, 0, optional.length - 1)] ?? "block";
  }

  const t = mix / 100;
  if (rng() > t) return "block";

  return optional[pickInt(rng, 0, optional.length - 1)] ?? "block";
}
