import {
  applyLookToAllFrames,
  applyLookToFrame,
  applyPalettePresetToFrame,
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

  assert(applied[0].id === look.id, "selected look frame keeps its id");
  assert(applied[0].settings.hueShift === 40, "selected look frame keeps the look settings");
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
  assert(
    applied[0].blocks[0].color === look.blocks[0].color,
    "look frame keeps its colour order",
  );

  const unchanged = applyLookToAllFrames([look], 0, "landscape");
  assert(unchanged[0] === look, "single-frame apply is a no-op");

  const importColors: [string, string, string] = ["#ff0000", "#00ff00", "#0000ff"];
  const themeColors: [string, string, string] = ["#111111", "#222222", "#333333"];
  const imported = importedFrame("palette", importColors);
  const withTheme = applyPalettePresetToFrame(imported, {
    id: "test-theme",
    label: "Test",
    category: "common",
    colors: themeColors,
  });
  assert(withTheme.blocks[0].color === "#111111", "imported theme remaps slot 0");
  assert(withTheme.blocks[1].color === "#222222", "imported theme remaps slot 1");
  assert(withTheme.blocks[2].color === "#333333", "imported theme remaps slot 2");
  assert(withTheme.blocks[0].width === 4, "imported theme keeps tile geometry");

  const eightColorFrame = importedFrame("eight", [
    "#100000",
    "#200000",
    "#300000",
    "#400000",
    "#500000",
    "#600000",
    "#700000",
    "#800000",
  ] as unknown as [string, string, string]);
  eightColorFrame.imageSource!.paletteRgb = Array.from({ length: 8 }, (_, i) => ({
    r: (i + 1) * 16,
    g: 0,
    b: 0,
  }));
  const fiveColorTheme: [string, string, string, string, string] = [
    "#111111",
    "#222222",
    "#333333",
    "#444444",
    "#555555",
  ];
  const themedEight = applyPalettePresetToFrame(eightColorFrame, {
    id: "five-theme",
    label: "Five",
    category: "common",
    colors: fiveColorTheme,
  });
  assert(
    themedEight.settings.colors.length === 5,
    "preset replaces palette length",
  );
  assert(
    themedEight.blocks[0].color === "#111111",
    "shorter theme remaps by slot",
  );
}

run();
console.log("apply look tests passed");
