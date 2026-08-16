import {
  applyLookToAllFrames,
  applyLookToFrame,
  createDefaultSettings,
} from "./frameUtils";
import type { Frame, MosaicBlock } from "../types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sampleBlocks(colors: [string, string, string]): MosaicBlock[] {
  return [
    { col: 0, row: 0, width: 4, height: 2, shape: "block", color: colors[0] },
    { col: 4, row: 0, width: 2, height: 3, shape: "block", color: colors[1] },
    { col: 0, row: 2, width: 2, height: 2, shape: "block", color: colors[2] },
  ];
}

function importedFrame(
  id: string,
  colors: [string, string, string],
  extras: Partial<Frame> = {},
): Frame {
  return {
    id,
    settings: {
      ...createDefaultSettings(),
      colors: [...colors],
      colorAmounts: [40, 35, 25],
      hueShift: 0,
      gridOverlay: false,
      layoutSource: "imported",
    },
    blocks: sampleBlocks(colors),
    imageSource: {
      dataUrl: `data:image/png;base64,${id}`,
      palette: [...colors],
      paletteRgb: [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 },
      ],
    },
    ...extras,
  };
}

function run(): void {
  const lookColors: [string, string, string] = ["#111111", "#222222", "#333333"];
  const otherColors: [string, string, string] = ["#ff0000", "#00ff00", "#0000ff"];
  const look = importedFrame("look", lookColors, {
    settings: {
      ...importedFrame("look", lookColors).settings,
      hueShift: 40,
      gridOverlay: true,
      invert: true,
    },
    textureOverlay: { dataUrl: "data:image/png;base64,tex" },
  });
  const other = importedFrame("other", otherColors);

  const styled = applyLookToFrame(other, look, "landscape");

  assert(styled.id === "other", "destination id stays");
  assert(
    styled.imageSource?.dataUrl === other.imageSource?.dataUrl,
    "destination picture stays",
  );
  assert(styled.blocks.length === other.blocks.length, "tile count stays");
  assert(styled.blocks[0].col === 0, "tile column stays");
  assert(styled.blocks[0].width === 4, "tile size stays");
  assert(styled.blocks[0].color === "#111111", "first colour remaps by slot");
  assert(styled.blocks[1].color === "#222222", "second colour remaps by slot");
  assert(styled.blocks[2].color === "#333333", "third colour remaps by slot");
  assert(styled.settings.hueShift === 40, "hue copies from the look");
  assert(styled.settings.gridOverlay === true, "grid overlay copies from the look");
  assert(styled.settings.invert === true, "invert copies from the look");
  assert(
    styled.textureOverlay?.dataUrl === "data:image/png;base64,tex",
    "texture overlay copies from the look",
  );
  assert(
    look.blocks[0].color === "#111111" && look.imageSource?.dataUrl === "data:image/png;base64,look",
    "look frame is not mutated",
  );

  const frames = [look, other, importedFrame("third", otherColors)];
  const applied = applyLookToAllFrames(frames, 0, "landscape");

  assert(applied[0] === look, "selected look frame is left in place");
  assert(applied[1].id === "other", "second frame keeps its id");
  assert(applied[2].id === "third", "third frame keeps its id");
  assert(
    applied[1].imageSource?.dataUrl === other.imageSource?.dataUrl,
    "second picture stays",
  );
  assert(
    applied[2].imageSource?.dataUrl === "data:image/png;base64,third",
    "third picture stays",
  );
  assert(applied[1].settings.hueShift === 40, "second frame gets the look");
  assert(applied[2].settings.hueShift === 40, "third frame gets the look");
  assert(applied[1].blocks[0].width === 4, "second mosaic geometry stays");
  assert(applied[2].blocks[1].height === 3, "third mosaic geometry stays");

  const unchanged = applyLookToAllFrames([look], 0, "landscape");
  assert(unchanged[0] === look, "single-frame apply is a no-op");
}

run();
console.log("apply look tests passed");
