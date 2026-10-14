import {
  applyLookToAllFrames,
  applyLookToFrame,
  applyPalettePresetToFrame,
  canRestorePhotoColors,
  cloneFrameLook,
  createDefaultSettings,
  importColorCountRange,
  redistributeAmounts,
  restorePhotoColorsToFrame,
  setImportColorCount,
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

function amountTests(): void {
  const raised = redistributeAmounts([40, 35, 25], 2, 65);
  assert(raised.join() === "19,16,65", `others shrink proportionally, got ${raised.join()}`);
  assert(redistributeAmounts([40, 35, 25], 0, 100).join() === "100,0,0", "100 takes all");
  assert(
    redistributeAmounts([40, 35, 25], 0, 40).join() === "40,35,25",
    "dragging back against the drag-start base restores the shares",
  );
  assert(
    redistributeAmounts([100, 0, 0], 0, 70).join() === "70,15,15",
    "freed share splits evenly when the others were 0",
  );
  assert(
    redistributeAmounts([34, 64, 20, 20, 20], 1, 50).reduce((a, b) => a + b, 0) === 100,
    "older over-100 totals normalise on the next drag",
  );
}

function run(): void {
  amountTests();
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

  const clipboardLook = cloneFrameLook(look);
  const pasted = applyLookToFrame(other, clipboardLook, "landscape");
  assert(
    pasted.imageSource?.dataUrl === other.imageSource?.dataUrl,
    "clipboard look keeps the destination picture",
  );
  assert(pasted.settings.hueShift === 40, "clipboard look copies hue");
  assert(
    pasted.textureOverlay?.dataUrl === "data:image/png;base64,tex",
    "clipboard look copies texture overlay",
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
  assert(
    applied[1].settings.gridOverlaySeed !== applied[2].settings.gridOverlaySeed,
    "apply look mints a unique overlay seed per destination frame",
  );
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
  }, "landscape");
  // Image slots by tone: blue (darkest) < red < green (lightest).
  assert(withTheme.blocks[2].color === "#111111", "darkest slot gets darkest theme colour");
  assert(withTheme.blocks[0].color === "#222222", "middle slot gets middle theme colour");
  assert(withTheme.blocks[1].color === "#333333", "lightest slot gets lightest theme colour");
  assert(withTheme.blocks[0].width === 4, "imported theme keeps tile geometry");
  assert(
    withTheme.imageSource?.themeColors?.join(",") === themeColors.join(","),
    "theme is kept with the image so the threshold uses it",
  );

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
  }, "landscape");
  assert(
    themedEight.settings.colors.length === 5,
    "preset replaces palette length",
  );
  assert(
    themedEight.blocks[0].color === "#111111",
    "darkest image colour lands on darkest theme colour",
  );
  assert(
    themedEight.blocks.every((block) => fiveColorTheme.includes(block.color as never)),
    "every tile uses a theme colour after a shorter theme caps the threshold",
  );
  const range = importColorCountRange(themedEight);
  assert(range?.max === 5 && range.value === 5, "threshold caps at theme length");

  const themedThree = setImportColorCount(themedEight, 3, "landscape");
  assert(themedThree.settings.colors.length === 3, "threshold reduces themed slots");
  assert(
    themedThree.settings.colors.every((color) => fiveColorTheme.includes(color as never)),
    "reduced slots pick only theme colours",
  );
  assert(
    themedThree.blocks.every((block) => themedThree.settings.colors.includes(block.color)),
    "tiles follow the reduced themed slots",
  );
  const themedBack = setImportColorCount(themedThree, 5, "landscape");
  assert(
    themedBack.settings.colors.slice().sort().join(",") ===
      fiveColorTheme.slice().sort().join(","),
    "raising the threshold brings every theme colour back, no image colours",
  );

  assert(
    !canRestorePhotoColors(imported),
    "fresh import matches photo palette — nothing to restore",
  );
  assert(
    canRestorePhotoColors(withTheme),
    "theme override offers restore from photo",
  );
  const restored = restorePhotoColorsToFrame(withTheme);
  assert(
    restored.settings.colors.join(",") === importColors.join(","),
    "restore puts photo palette back",
  );
  assert(
    restored.blocks[0].color === "#ff0000",
    "restore remaps slot 0 to photo colour",
  );
  assert(
    restored.blocks[0].width === 4,
    "restore keeps tile geometry",
  );
  assert(
    !canRestorePhotoColors(restored),
    "after restore the button should hide",
  );
}

run();
console.log("apply look tests passed");
