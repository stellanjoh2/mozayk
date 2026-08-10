export type Orientation = "landscape" | "portrait";
export type Density = 1 | 2 | 3 | 4 | 5 | 6;
export type ShapeType = "block" | "sphere";
export type BackgroundMode = "black" | "transparent";

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
