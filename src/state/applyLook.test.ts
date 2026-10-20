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

  // Apply Look must carry theme + threshold onto other imported frames.
  const videoA = importedFrame("vid-a", importColors);
  const videoB = importedFrame("vid-b", importColors);
  const themedLook = applyPalettePresetToFrame(
    videoA,
    {
      id: "look-theme",
      label: "Look",
      category: "common",
      colors: themeColors,
    },
    "landscape",
  );
  const themedBatch = applyLookToFrame(videoB, themedLook, "landscape");
  assert(
    themedBatch.imageSource?.themeColors?.join(",") ===
      themedLook.imageSource?.themeColors?.join(","),
    "apply look copies themeColors onto the destination",
  );
  assert(
    themedBatch.imageSource?.dataUrl === videoB.imageSource?.dataUrl,
    "apply look keeps the destination picture when theming",
  );
  assert(
    themedBatch.settings.colors.join(",") === themedLook.settings.colors.join(","),
    "apply look copies the look swatches by slot (not re-tone-mapped)",
  );
  assert(
    themedBatch.blocks.map((b) => b.color).join(",") ===
      themedLook.blocks.map((b) => b.color).join(","),
    "apply look remaps destination tiles to the look swatch slots",
  );
  assert(
    themedBatch.blocks.length === videoB.blocks.length,
    "without a cached source image, apply look recolors in place (no invented tiles)",
  );

  // Regression: painting a low-luminance red onto the brightest slot must stay
  // on bright regions after Apply Look (tone-remap used to flip it to dark).
  const toneColors: [string, string, string] = ["#808080", "#101010", "#f0f0f0"];
  const toneLook = importedFrame("tone-look", toneColors);
  toneLook.imageSource!.paletteRgb = [
    { r: 128, g: 128, b: 128 },
    { r: 16, g: 16, b: 16 },
    { r: 240, g: 240, b: 240 },
  ];
  const toneTheme: [string, string, string] = ["#220000", "#888888", "#ffeeee"];
  const toneThemed = applyPalettePresetToFrame(
    toneLook,
    { id: "tone", label: "Tone", category: "common", colors: toneTheme },
    "landscape",
  );
  const brightHex = "#ffeeee";
  const brightSlot = toneThemed.settings.colors.indexOf(brightHex);
  assert(brightSlot >= 0, "theme exposes a light swatch");
  toneThemed.settings = {
    ...toneThemed.settings,
    colors: toneThemed.settings.colors.map((c, i) =>
      i === brightSlot ? "#ff0000" : c,
    ),
  };
  toneThemed.blocks = toneThemed.blocks.map((b) =>
    b.color === brightHex ? { ...b, color: "#ff0000" } : b,
  );
  const toneDest = importedFrame("tone-dest", toneColors);
  toneDest.imageSource!.paletteRgb = toneLook.imageSource!.paletteRgb.map((c) => ({
    ...c,
  }));
  toneDest.blocks = [
    { col: 0, row: 0, width: 1, height: 1, shape: "block", color: "#101010" },
    { col: 1, row: 0, width: 1, height: 1, shape: "block", color: "#f0f0f0" },
    { col: 2, row: 0, width: 1, height: 1, shape: "block", color: "#808080" },
  ];
  const toneApplied = applyLookToFrame(toneDest, toneThemed, "landscape");
  assert(
    toneApplied.settings.colors[brightSlot] === "#ff0000",
    "red stays on the brightest swatch slot after apply look",
  );
  assert(
    toneApplied.blocks[1]?.color === "#ff0000",
    "bright image regions keep red after apply look (not flipped to dark)",
  );
  assert(
    toneApplied.blocks[0]?.color !== "#ff0000",
    "dark image regions do not steal the bright-slot red",
  );

  const eight = importedFrame("thresh", [
    "#100000",
    "#200000",
    "#300000",
    "#400000",
    "#500000",
    "#600000",
    "#700000",
    "#800000",
  ] as unknown as [string, string, string]);
  eight.imageSource!.paletteRgb = Array.from({ length: 8 }, (_, i) => ({
    r: (i + 1) * 16,
    g: 0,
    b: 0,
  }));
  eight.imageSource!.palette = Array.from(
    { length: 8 },
    (_, i) =>
      `#${((i + 1) * 16).toString(16).padStart(2, "0")}0000`,
  );
  eight.settings = {
    ...eight.settings,
    colors: [...eight.imageSource!.palette],
    colorAmounts: eight.imageSource!.palette.map(() => 12),
  };
  eight.blocks = eight.imageSource!.palette.map((color, i) => ({
    col: i,
    row: 0,
    width: 1,
    height: 1,
    shape: "block",
    color,
  }));
  const eightB = structuredClone(eight);
  eightB.id = "thresh-b";
  eightB.imageSource!.dataUrl = "data:image/png;base64,thresh-b";
  const reducedLook = setImportColorCount(eight, 3, "landscape");
  const reducedBatch = applyLookToFrame(eightB, reducedLook, "landscape");
  assert(
    reducedBatch.imageSource?.colorCount === 3,
    "apply look copies the colour threshold onto the destination",
  );
  assert(
    reducedBatch.settings.colors.length === 3,
    "apply look threshold shortens the working palette",
  );
  assert(
    importColorCountRange(reducedBatch)?.value === 3,
    "apply look threshold updates the slider value",
  );
  assert(
    reducedBatch.settings.colors.join(",") ===
      reducedLook.settings.colors.join(","),
    "reduce-then-apply-look keeps the source swatches (no theme)",
  );
  const again = applyLookToAllFrames(
    [reducedLook, reducedBatch],
    0,
    "landscape",
  );
  const again2 = applyLookToAllFrames(again, 0, "landscape");
  assert(
    again2.every((f) => f.settings.colors.length === 3),
    "repeated apply look must not shrink the palette",
  );
  assert(
    again2[1]!.settings.colors.join(",") ===
      reducedLook.settings.colors.join(","),
    "repeated apply look keeps the same swatches",
  );

  // Paste style (clipboard look) must match live apply-look on reduced imports.
  const eightC = structuredClone(eight);
  eightC.id = "thresh-c";
  eightC.imageSource!.dataUrl = "data:image/png;base64,thresh-c";
  const clipboardReduced = cloneFrameLook(reducedLook);
  const pastedReduced = applyLookToFrame(eightC, clipboardReduced, "landscape");
  assert(
    pastedReduced.imageSource?.dataUrl === eightC.imageSource?.dataUrl,
    "paste style keeps the destination picture",
  );
  assert(
    pastedReduced.imageSource?.colorCount === 3,
    "paste style copies the colour threshold",
  );
  assert(
    pastedReduced.settings.colors.join(",") ===
      reducedLook.settings.colors.join(","),
    "paste style copies the reduced swatches",
  );
  const pastedAgain = applyLookToFrame(
    pastedReduced,
    clipboardReduced,
    "landscape",
  );
  assert(
    pastedAgain.settings.colors.length === 3,
    "pasting the same style again must not shrink colours",
  );

  const pausedLook = importedFrame("paused", lookColors, {
    settings: {
      ...importedFrame("paused", lookColors).settings,
      gridOverlaySeed: 42,
      gridCrossesSeed: 43,
      randomizePaused: { gridOverlay: true },
    },
  });
  const pausedDest = importedFrame("paused-dest", otherColors);
  const pausedApplied = applyLookToFrame(pausedDest, pausedLook, "landscape");
  assert(
    pausedApplied.settings.gridOverlaySeed === 42,
    "paused overlay keeps the look seed on apply look",
  );
  assert(
    pausedApplied.settings.gridCrossesSeed !== 43,
    "unpaused crosses still mint a new seed on apply look",
  );

  const clipboardThemed = cloneFrameLook(themedLook);
  const pastedTheme = applyLookToFrame(videoB, clipboardThemed, "landscape");
  assert(
    pastedTheme.imageSource?.themeColors?.join(",") === themeColors.join(","),
    "paste style carries themeColors from the clipboard look",
  );
  assert(
    pastedTheme.imageSource?.dataUrl === videoB.imageSource?.dataUrl,
    "paste style still keeps the destination picture",
  );

  // Hand-edited swatch (no theme): paste must not reset destinations to photo.
  const editA = importedFrame("edit-a", importColors);
  const editB = importedFrame("edit-b", importColors);
  editA.settings = {
    ...editA.settings,
    colors: ["#abcdef", importColors[1], importColors[2]],
  };
  editA.blocks = editA.blocks.map((block, i) =>
    i === 0 ? { ...block, color: "#abcdef" } : block,
  );
  const editedClipboard = cloneFrameLook(editA);
  const pastedEdit = applyLookToFrame(editB, editedClipboard, "landscape");
  assert(
    pastedEdit.settings.colors[0] === "#abcdef",
    "paste style keeps a hand-edited swatch (does not restore photo colours)",
  );
  assert(
    pastedEdit.blocks[0]?.color === "#abcdef",
    "paste style paints the hand-edited swatch onto destination tiles",
  );
  assert(
    pastedEdit.imageSource?.dataUrl === editB.imageSource?.dataUrl,
    "hand-edit paste keeps the destination picture",
  );

  // Density on the look without a remesh used to shrink tiles into the corner.
  const denseLook = importedFrame("dense-look", importColors);
  denseLook.settings = { ...denseLook.settings, density: 6, hueShift: 15 };
  const sparseDest = importedFrame("sparse-dest", importColors);
  sparseDest.settings = { ...sparseDest.settings, density: 2 };
  const denserApplied = applyLookToFrame(sparseDest, denseLook, "landscape");
  assert(
    denserApplied.settings.density === 2,
    "without a cached photo, apply look keeps destination density so tiles still fill",
  );
  assert(
    denserApplied.settings.hueShift === 15,
    "without a cached photo, non-layout look settings still copy",
  );
  assert(
    denserApplied.blocks[0]?.width === sparseDest.blocks[0]?.width,
    "without a cached photo, tile geometry stays put",
  );

  const sameColorsDest = importedFrame("same-colors", importColors);
  sameColorsDest.settings = {
    ...sameColorsDest.settings,
    density: 2,
    colors: [...denseLook.settings.colors],
    colorAmounts: [...(denseLook.settings.colorAmounts ?? [34, 33, 33])],
  };
  sameColorsDest.blocks = denseLook.blocks.map((block) => ({ ...block }));
  // Fast path: matching swatches + higher look density must not orphan tiles.
  const fastDense = applyLookToFrame(sameColorsDest, denseLook, "landscape");
  assert(
    fastDense.settings.density === 2,
    "fast-path apply look keeps destination density when the photo is not cached",
  );
  assert(
    fastDense.settings.hueShift === 15,
    "fast-path apply look still copies non-layout settings",
  );
}

run();
console.log("apply look tests passed");
