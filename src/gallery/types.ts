export const RATIOS = ["landscape", "square", "portrait"] as const;
export type Ratio = (typeof RATIOS)[number];

export const RATIO_LABELS: Record<Ratio, string> = {
  landscape: "16:9",
  square: "1:1",
  portrait: "9:16",
};

export const RATIO_VALUE: Record<Ratio, number> = {
  landscape: 16 / 9,
  square: 1,
  portrait: 9 / 16,
};

export const MAX_ITEMS = 24;
export const MAX_RINGS = 3;
export const DEFAULT_BACKGROUND = "#8f8f8f";

export function padBackgrounds(
  list?: string[],
  fallbacks?: string[],
): string[] {
  return Array.from(
    { length: MAX_RINGS },
    (_, i) => list?.[i] ?? fallbacks?.[i] ?? DEFAULT_BACKGROUND,
  );
}

export type MediaKind = "image" | "video" | "gif";

export type GalleryItem = {
  src: string;
  kind?: MediaKind;
};

export const DISTRIBUTIONS = ["cluster", "ring"] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number];

export const DISTRIBUTION_LABELS: Record<Distribution, string> = {
  cluster: "Close",
  ring: "Ring",
};

export type GallerySettings = {
  ratio: Ratio;
  /** cluster = packed arc; ring = even around 360°. */
  distribution: Distribution;
  /** One wash per ring. Index 0 is the ground floor. */
  backgrounds: string[];
  distortion: number;
  chromaticAberration: number;
  /** 1 = default. Higher pushes the distortion crop off the viewport. */
  overscan: number;
  /** 1 = default FOV. Lower pulls the camera back (wider). Ring / unfocused. */
  cameraZoom: number;
  /** 1 = focused panel fills the view. Higher zooms in past fill. */
  focusZoom: number;
  /** 0 = longer coast, 1 = stops quickly. Ease-out slowdown to a full stop. */
  spinFriction: number;
  cornerRadius: number;
  /** Degrees. 0 is upright; positive drops the front of the ring. */
  axisTilt: number;
  /** Degrees. 0 is upright; positive rolls the ring clockwise. */
  ringTilt: number;
};

export const DEFAULT_SETTINGS: GallerySettings = {
  ratio: "landscape",
  distribution: "ring",
  backgrounds: padBackgrounds(["#64717d", "#647d69", "#7d7664"]),
  distortion: 0.05,
  chromaticAberration: 0.002,
  overscan: 1.75,
  cameraZoom: 0.83,
  focusZoom: 1,
  spinFriction: 0.15,
  cornerRadius: 0.04,
  axisTilt: -5,
  ringTilt: -13,
};

export type GalleryOptions = Partial<GallerySettings> & {
  items?: GalleryItem[];
  /** Extra floors above `items`. Index 0 is the ground ring. Max 3 including `items`. */
  rings?: GalleryItem[][];
  selectedIndex?: number;
  selectedRing?: number;
  preview?: boolean;
  onSelect?: (index: number, ring?: number) => void;
  /** One color for every ring when `backgrounds` is omitted. */
  background?: string;
};
