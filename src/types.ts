import type { ImageSourceData } from "./import/imageSource";

/** Canvas ratios: 16:9, 9:16, 1:1, and 3:4 (Instagram photo / profile grid). */
export type Orientation = "landscape" | "portrait" | "square" | "photo";

/** Wide → tall order for the canvas picker. */
export const ORIENTATIONS: readonly Orientation[] = [
  "landscape",
  "square",
  "photo",
  "portrait",
];

export const ORIENTATION_LABELS: Record<Orientation, string> = {
  landscape: "16:9",
  square: "1:1",
  photo: "3:4",
  portrait: "9:16",
};

export function isOrientation(value: unknown): value is Orientation {
  return (
    value === "landscape" ||
    value === "portrait" ||
    value === "square" ||
    value === "photo"
  );
}
/**
 * User-facing density steps. 0 is OFF (no tiles).
 * 1–12 multiply the 16×9 / 9×9 / 9×12 / 9×16 base (always square cells).
 * 7 and 9 omitted — fractional cells (17/18, 13/14) broke square spans.
 */
export type Density = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
export type GridOverlayStroke = 1 | 2 | 4;
/** Blend mode for grid overlay strokes over the mosaic. */
export type GridBlendMode = "normal" | "difference" | "screen";
/** Content shown by data-field labels. */
export type DataFieldsValueType =
  | "grid"
  | "index"
  | "random"
  | "decimal"
  | "hex";
/** Blend mode for a full-frame texture overlay (dirt / grain / etc.). */
export type TextureOverlayBlendMode =
  | "multiply"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "screen"
  | "difference";
export type ShapeType = "block" | "sphere" | "ring" | "triangle" | "cross";
export type LayoutSource = "procedural" | "imported";

export const RANDOMIZE_PAUSE_KEYS = [
  "fillAmount",
  "weight",
  "scaleBlend",
  "ringThickness",
  "randomHeight",
  "randomWidth",
  "gridOverlay",
  "gridCrosses",
  "gridBlur",
  "dataFields",
] as const;

export type RandomizePauseKey = (typeof RANDOMIZE_PAUSE_KEYS)[number];

export type ShapePalette = {
  sphere: boolean;
  ring: boolean;
  /** Upper-right half of a diagonally split square. */
  triangle: boolean;
  /** Plus-shaped cross inscribed in the cell. */
  cross: boolean;
};

export type MosaicBlock = {
  col: number;
  row: number;
  width: number;
  height: number;
  shape: ShapeType;
  color: string;
};

export type FrameSettings = {
  density: Density;
  shapeMix: number;
  shapes: ShapePalette;
  /** 0 = thin ring · 100 = solid disc. Absolute wall width, shared by all rings. */
  ringThickness: number;
  /** Internal — derived from density; not user-facing. */
  minCellSize: number;
  /** Internal similar-size ceiling for scale blend — derived from density. */
  maxCellSize: number;
  maxHeight: number;
  randomHeight: boolean;
  maxWidth: number;
  randomWidth: boolean;
  fillAmount: number;
  weight: number;
  /**
   * 0 = similar sizes, 6 = max contrast (min-sized detail + large simple blocks).
   * High contrast opens giants toward Max Width / Max Height.
   */
  scaleBlend: number;
  colors: string[];
  /** Relative colour share on canvas (normalized at assignment time). */
  colorAmounts: number[];
  /** When true, that slot keeps its hex during New Random Colours. */
  colorsLocked?: boolean[];
  /** Solid fill colour (hex). Ignored while transparentBackground is on. */
  background: string;
  /** Checkerboard preview · no fill in SVG / transparent export. */
  transparentBackground?: boolean;
  /** Stroked grid over mosaic shapes. */
  gridOverlay?: boolean;
  /** Overlay grid density — independent of layout density. Defaults to 1. */
  gridOverlayDensity?: Density;
  /** Overlay stroke colour (hex). Defaults to white. */
  gridOverlayColor?: string;
  /** Overlay stroke width in px: 1, 2, or 4. Defaults to 1. */
  gridOverlayStroke?: GridOverlayStroke;
  /** Overlay stroke opacity 0–100. Defaults to 100. */
  gridOverlayOpacity?: number;
  /** Break square grid into irregular paths 0–100. Defaults to 0. */
  gridOverlayChaos?: number;
  /** Blend mode for grid lines over the mosaic. Defaults to normal. */
  gridOverlayBlend?: GridBlendMode;
  /** Plus marks on a dedicated crosses grid. */
  gridCrosses?: boolean;
  /** Crosses grid density — independent of overlay / layout density. Defaults to 1. */
  gridCrossesDensity?: Density;
  /** Cross stroke colour (hex). Defaults to white. */
  gridCrossesColor?: string;
  /** Cross stroke width in px: 1, 2, or 4. Defaults to 1. */
  gridCrossesStroke?: GridOverlayStroke;
  /** How far each plus extends, in px (full span). Defaults to 24. */
  gridCrossesSize?: number;
  /** Cross opacity 0–100. Defaults to 100. */
  gridCrossesOpacity?: number;
  /** Randomly omit crosses 0–100. Defaults to 0. */
  gridCrossesChaos?: number;
  /** Blend mode for crosses over the mosaic. Defaults to normal. */
  gridCrossesBlend?: GridBlendMode;
  /** Final Gaussian blur over the finished mosaic. Skipped during live playback unless high quality mode is on. */
  gridBlur?: boolean;
  /** Blur grid density — independent of layout density. */
  gridBlurDensity?: Density;
  /** Blur radius 0–100, relative to grid cell size. Defaults to 50. */
  gridBlurAmount?: number;
  /** Break uniform blur into irregular on-grid patches 0–100. Defaults to 50. */
  gridBlurChaos?: number;
  /** Film grain over the finished image 0–100. Defaults to 0. */
  noiseAmount?: number;
  /** Hue rotation in degrees −180–180. Defaults to 0. */
  hueShift?: number;
  /** Contrast −100–100. Defaults to 0 (unchanged). */
  contrast?: number;
  /** Brightness −100–100. Defaults to 0 (unchanged). */
  brightness?: number;
  /** Invert the finished image (full-frame difference with white). */
  invert?: boolean;
  /** Master switch for Extras. Defaults on when any extra is non-default. */
  extrasEnabled?: boolean;
  /** Corner radius for box shapes 0–100. 100 = pill. Defaults to 0. */
  cornerRadius?: number;
  /** Shrink shapes from centre 0–100. 100 = 25% smaller. Defaults to 0. */
  shapeGap?: number;
  /** Draw a share of blocks as inner outlines (smallest first). */
  wireframePeel?: boolean;
  /** Share of blocks to outline 0–100. Defaults to 50. */
  wireframePeelAmount?: number;
  /** Outline thickness in px: 1, 2, or 4. Defaults to 1. */
  wireframePeelStroke?: GridOverlayStroke;
  /** Sparse monospace labels in cell corners (PNG). */
  dataFields?: boolean;
  /** What each label shows. Defaults to grid coordinates. */
  dataFieldsValueType?: DataFieldsValueType;
  /** How many labels appear 0–5. 1 ≈ a few; 5 fills sparse strips (~1/16 of cells). Defaults to 1. */
  dataFieldsSpawnRate?: number;
  /** Glyph scale 1–8. Defaults to 1 (~8pt). */
  dataFieldsSize?: number;
  /** Label colour (hex). Defaults to white. */
  dataFieldsColor?: string;
  /** Blend mode for data-field labels. Defaults to normal. */
  dataFieldsBlend?: GridBlendMode;
  /** Reveal the imported photo in gaps between mosaic shapes. Requires imageSource. */
  showSourceImage?: boolean;
  /** Draw the local texture overlay. Defaults on when a texture is uploaded. */
  textureOverlayEnabled?: boolean;
  /** Blend mode for the local texture overlay. Defaults to multiply. */
  textureOverlayBlend?: TextureOverlayBlendMode;
  /** Texture overlay opacity 0–100. Defaults to 40. */
  textureOverlayOpacity?: number;
  /** Multiply tint applied to the texture before blending (hex). Defaults to white. */
  textureOverlayTint?: string;
  /** Imported image layouts are reshuffled instead of procedurally regenerated. */
  layoutSource?: LayoutSource;
  /** Pause icon — skip these controls in Randomize All and keep their instance on Apply Look. */
  randomizePaused?: Partial<Record<RandomizePauseKey, boolean>>;
  /** Overlay path instance. Copied when paused; minted per frame on Apply Look. */
  gridOverlaySeed?: number;
  gridCrossesSeed?: number;
  gridBlurSeed?: number;
  dataFieldsSeed?: number;
};

export type TextureOverlayData = {
  dataUrl: string;
};

export type BackgroundImageData = {
  dataUrl: string;
  name: string;
};

export type OrientationLayout = {
  orientation: Orientation;
  blocks: MosaicBlock[];
  colors: string[];
  derived?: Partial<Record<Orientation, MosaicBlock[]>>;
};

export type Frame = {
  id: string;
  settings: FrameSettings;
  blocks: MosaicBlock[];
  /** Source photo used to target colours/shapes when randomizing imported layouts. */
  imageSource?: ImageSourceData;
  /** Local texture overlay image (dirt / paper / etc.). Not pasted with settings. */
  textureOverlay?: TextureOverlayData;
  /** Local background photo. Not pasted with settings. */
  backgroundImage?: BackgroundImageData;
  /** Mosaic from before the current ratio-toggle session. */
  orientationLayout?: OrientationLayout;
};

export type GridDimensions = {
  columns: number;
  rows: number;
  cellSize: number;
  width: number;
  height: number;
};
