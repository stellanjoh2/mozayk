export type Orientation = "landscape" | "portrait";
export type Density = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ShapeType = "block" | "sphere" | "ring";
export type BackgroundMode = "black" | "transparent";

export type ShapePalette = {
  sphere: boolean;
  ring: boolean;
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
  /** 0 = solid disc · 100 = thin ring */
  ringThickness: number;
  minCellSize: number;
  maxCellSize: number;
  maxHeight: number;
  randomHeight: boolean;
  maxWidth: number;
  randomWidth: boolean;
  fillAmount: number;
  weight: number;
  /** 1 = macro (large blocks), 6 = micro (tiny blocks), 3 = mixed */
  scaleBlend: number;
  colors: string[];
  /** Relative colour share on canvas (normalized at assignment time). */
  colorAmounts: number[];
  background: BackgroundMode;
};

export type Frame = {
  id: string;
  settings: FrameSettings;
  blocks: MosaicBlock[];
};

export type GridDimensions = {
  columns: number;
  rows: number;
  cellSize: number;
  width: number;
  height: number;
};
