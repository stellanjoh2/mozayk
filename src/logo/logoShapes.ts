import { GALLERY_SHAPE_PATHS, type GalleryShape } from "../shapes/galleryShapes";

/** Unit kinds native to the logotype painter. */
export const LOGO_BASE_SHAPES = ["square", "circle", "triangle"] as const;

/**
 * Editor shapes offered in the logo creator strip (beyond the base three).
 * Kept to a short horizontal set — hard-edge / high-contrast first.
 */
export const LOGO_EXTRA_SHAPES = [
  "ring",
  "cross",
  "wedges",
  "checks",
  "dots",
  "ex",
  "star",
  "quads",
] as const;

export type LogoBaseShape = (typeof LOGO_BASE_SHAPES)[number];
export type LogoExtraShape = (typeof LOGO_EXTRA_SHAPES)[number];
export type LogoShapeId = LogoBaseShape | LogoExtraShape;
export type LogoGalleryShape = Extract<LogoShapeId, GalleryShape>;

export const LOGO_SHAPE_IDS: readonly LogoShapeId[] = [
  ...LOGO_BASE_SHAPES,
  ...LOGO_EXTRA_SHAPES,
];

export const LOGO_SHAPE_LABELS: Record<LogoShapeId, string> = {
  square: "Squares",
  circle: "Circles",
  triangle: "Triangles",
  ring: "Rings",
  cross: "Crosses",
  wedges: "Wedges",
  checks: "Checks",
  dots: "Dots",
  ex: "Xs",
  star: "Stars",
  quads: "Quads",
};

/** Defaults match today's painter: boxes / spheres / triangles only. */
export const DEFAULT_LOGO_SHAPES: readonly LogoShapeId[] = [...LOGO_BASE_SHAPES];

export function isLogoGalleryShape(shape: LogoShapeId): shape is LogoGalleryShape {
  return Object.hasOwn(GALLERY_SHAPE_PATHS, shape);
}

export function normalizeLogoShapes(
  shapes: readonly LogoShapeId[] | undefined,
): LogoShapeId[] {
  const allowed = new Set<LogoShapeId>(LOGO_SHAPE_IDS);
  const next = [...new Set((shapes ?? DEFAULT_LOGO_SHAPES).filter((s) => allowed.has(s)))];
  return next.length > 0 ? next : [...DEFAULT_LOGO_SHAPES];
}
