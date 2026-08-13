import type { ImageSourceData } from "./import/imageSource";

export type Orientation = "landscape" | "portrait" | "square";
export type Density = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type GridOverlayStroke = 1 | 2 | 4;
export type ShapeType = "block" | "sphere" | "ring" | "triangle" | "cross";
export type BackgroundMode = "black" | "transparent";
export type LayoutSource = "procedural" | "imported";

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
  /** 0 = solid disc · 100 = thin ring. Absolute wall width, shared by all rings. */
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
  background: BackgroundMode;
  /** Stroked grid over mosaic shapes. */
  gridOverlay?: boolean;
  /** Overlay grid density — independent of layout density. */
  gridOverlayDensity?: Density;
  /** Overlay stroke colour (hex). Defaults to white. */
  gridOverlayColor?: string;
  /** Overlay stroke width in px: 1, 2, or 4. Defaults to 2. */
  gridOverlayStroke?: GridOverlayStroke;
  /** Overlay stroke opacity 0–100. Defaults to 100. */
  gridOverlayOpacity?: number;
  /** Break square grid into irregular paths 0–100. Defaults to 0. */
  gridOverlayChaos?: number;
  /** When true, grid uses difference blend mode over the mosaic. */
  gridOverlayDifference?: boolean;
  /** 8×8px crosses on overlay-grid intersections. */
  gridCrosses?: boolean;
  /** Crosses grid density — independent of overlay / layout density. */
  gridCrossesDensity?: Density;
  /** Cross stroke colour (hex). Defaults to white. */
  gridCrossesColor?: string;
  /** Cross stroke width in px: 1, 2, or 4. Defaults to 2. */
  gridCrossesStroke?: GridOverlayStroke;
  /** How far each plus extends, in px (full span). Defaults to 8. */
  gridCrossesSize?: number;
  /** Cross opacity 0–100. Defaults to 100. */
  gridCrossesOpacity?: number;
  /** Randomly omit crosses 0–100. Defaults to 0. */
  gridCrossesChaos?: number;
  /** When true, crosses use difference blend mode. */
  gridCrossesDifference?: boolean;
  /** Final Gaussian blur over the finished mosaic (canvas / PNG only). */
  gridBlur?: boolean;
  /** Blur grid density — independent of layout density. */
  gridBlurDensity?: Density;
  /** Blur radius 0–100, relative to grid cell size. Defaults to 50. */
  gridBlurAmount?: number;
  /** Break uniform blur into irregular on-grid patches 0–100. Defaults to 0. */
  gridBlurChaos?: number;
  /** Film grain over the finished image 0–100. Defaults to 0. */
  noiseAmount?: number;
  /** Hue rotation in degrees −180–180. Defaults to 0. */
  hueShift?: number;
  /** Reveal the imported photo in gaps between mosaic shapes. Requires imageSource. */
  showSourceImage?: boolean;
  /** Imported image layouts are reshuffled instead of procedurally regenerated. */
  layoutSource?: LayoutSource;
};

export type Frame = {
  id: string;
  settings: FrameSettings;
  blocks: MosaicBlock[];
  /** Source photo used to target colours/shapes when randomizing imported layouts. */
  imageSource?: ImageSourceData;
};

export type GridDimensions = {
  columns: number;
  rows: number;
  cellSize: number;
  width: number;
  height: number;
};
