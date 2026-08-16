import { applyPastedSettings, createDefaultSettings } from "./frameUtils";
import {
  parseSettingsClipboard,
  serializeSettingsClipboard,
} from "./settingsClipboard";
import type { Frame, MosaicBlock } from "../types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sampleBlocks(): MosaicBlock[] {
  return [
    { col: 0, row: 0, width: 8, height: 3, shape: "ring", color: "#ff3355" },
    { col: 8, row: 0, width: 4, height: 4, shape: "block", color: "#22cc88" },
    { col: 0, row: 3, width: 2, height: 2, shape: "cross", color: "#3355ff" },
  ];
}

function blankFrame(): Frame {
  return {
    id: "frame",
    settings: createDefaultSettings(),
    blocks: [
      { col: 0, row: 0, width: 1, height: 1, shape: "block", color: "#ffffff" },
    ],
  };
}

function run(): void {
  const settings = {
    ...createDefaultSettings(),
    fillAmount: 92,
    randomWidth: true,
    randomHeight: true,
    maxWidth: 24,
    maxHeight: 18,
    colors: ["#ff3355", "#22cc88", "#3355ff"],
    colorAmounts: [40, 35, 25],
  };
  const blocks = sampleBlocks();
  const json = serializeSettingsClipboard(settings, blocks, "landscape");
  const parsed = parseSettingsClipboard(json);

  assert(parsed !== null, "serialized preset should parse");
  assert(parsed.settings.fillAmount === 92, "fill amount survives round-trip");
  assert(parsed.orientation === "landscape", "orientation survives round-trip");
  assert(parsed.blocks?.length === blocks.length, "block count survives round-trip");
  assert(parsed.blocks?.[0].shape === "ring", "block shape survives round-trip");
  assert(parsed.blocks?.[0].color === "#ff3355", "block colour survives round-trip");
  assert(parsed.blocks?.[0].width === 8, "block size survives round-trip");

  const restored = applyPastedSettings(blankFrame(), parsed, "landscape");
  assert(restored.blocks.length === blocks.length, "paste keeps the copied tiles");
  assert(restored.blocks[0].width === 8, "paste does not scatter into unit cells");
  assert(restored.blocks[1].color === "#22cc88", "paste keeps tile colours");
  assert(restored.settings.fillAmount === 92, "paste applies copied sliders");

  const transposed = applyPastedSettings(blankFrame(), parsed, "portrait");
  assert(transposed.blocks.length === blocks.length, "landscape preset transposes to portrait");
  assert(transposed.blocks[0].col === 0, "transposed origin column");
  assert(transposed.blocks[0].row === 0, "transposed origin row");
  assert(transposed.blocks[0].width === 3, "transposed width swaps with height");
  assert(transposed.blocks[0].height === 8, "transposed height swaps with width");

  const square = applyPastedSettings(blankFrame(), parsed, "square");
  assert(
    square.blocks[0]?.shape !== "ring" || square.blocks[0]?.width !== 8,
    "square paste does not keep the landscape mosaic",
  );

  const legacy = parseSettingsClipboard(
    JSON.stringify({
      v: 1,
      mozayk: "settings",
      settings: {
        density: 5,
        fillAmount: 85,
        colors: ["#abcdef"],
        colorAmounts: [100],
      },
    }),
  );
  assert(legacy !== null, "legacy settings-only JSON should parse");
  assert(legacy.blocks === undefined, "legacy payload has no tiles");
  assert(legacy.settings.randomWidth === true, "omitted randomWidth defaults on");
  assert(legacy.settings.randomHeight === true, "omitted randomHeight defaults on");
  assert(legacy.settings.shapes.sphere === true, "omitted shapes default to the mix palette");
  assert(legacy.settings.wireframePeel === false, "omitted wireframe peel defaults off");
  assert(legacy.settings.wireframePeelStroke === 1, "omitted wireframe peel stroke defaults to 1px");
  assert(legacy.settings.cornerRadius === 0, "omitted corner radius defaults to 0");
  assert(legacy.settings.shapeGap === 0, "omitted shape gap defaults to 0");

  const rawPreset = parseSettingsClipboard(
    JSON.stringify({
      density: 4,
      colors: ["#111111", "#eeeeee"],
      fillAmount: 70,
      scaleBlend: 5,
    }),
  );
  assert(rawPreset !== null, "bare preset object should parse");
  assert(rawPreset.settings.density === 4, "bare preset density");
  assert(rawPreset.settings.randomWidth === true, "bare preset should not collapse to 1×1");

  const explicitOff = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      randomWidth: false,
      randomHeight: false,
    }),
  );
  assert(explicitOff !== null, "explicit flags should parse");
  assert(explicitOff.settings.randomWidth === false, "explicit randomWidth false is kept");
  assert(explicitOff.settings.randomHeight === false, "explicit randomHeight false is kept");

  const peel = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      wireframePeel: true,
      wireframePeelAmount: 80,
      wireframePeelStroke: 4,
    }),
  );
  assert(peel !== null, "wireframe peel settings should parse");
  assert(peel.settings.wireframePeel === true, "wireframe peel toggle kept");
  assert(peel.settings.wireframePeelAmount === 80, "wireframe peel amount kept");
  assert(peel.settings.wireframePeelStroke === 4, "wireframe peel stroke kept");

  const radius = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      cornerRadius: 70,
    }),
  );
  assert(radius !== null, "corner radius settings should parse");
  assert(radius.settings.cornerRadius === 70, "corner radius kept");

  const gap = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      shapeGap: 40,
    }),
  );
  assert(gap !== null, "shape gap settings should parse");
  assert(gap.settings.shapeGap === 40, "shape gap kept");

  const bg = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      background: "#ff5300",
      transparentBackground: true,
    }),
  );
  assert(bg !== null, "background settings should parse");
  assert(bg.settings.background === "#ff5300", "background hex kept");
  assert(bg.settings.transparentBackground === true, "transparent toggle kept");

  const legacyBlack = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      background: "black",
    }),
  );
  assert(legacyBlack !== null, "legacy black background should parse");
  assert(legacyBlack.settings.background === "#000000", "legacy black becomes hex");
  assert(
    legacyBlack.settings.transparentBackground === false,
    "legacy black is not transparent",
  );

  const legacyTransparent = parseSettingsClipboard(
    JSON.stringify({
      density: 5,
      colors: ["#ffffff"],
      background: "transparent",
    }),
  );
  assert(legacyTransparent !== null, "legacy transparent background should parse");
  assert(
    legacyTransparent.settings.background === "#000000",
    "legacy transparent keeps a black fill colour",
  );
  assert(
    legacyTransparent.settings.transparentBackground === true,
    "legacy transparent becomes the toggle",
  );

  const roundTrip = parseSettingsClipboard(
    serializeSettingsClipboard(
      {
        ...createDefaultSettings(),
        background: "#112233",
        transparentBackground: true,
      },
      sampleBlocks(),
      "landscape",
    ),
  );
  assert(roundTrip !== null, "background round-trip should parse");
  assert(roundTrip.settings.background === "#112233", "hex survives round-trip");
  assert(
    roundTrip.settings.transparentBackground === true,
    "transparent toggle survives round-trip",
  );
}

run();
console.log("paste settings tests passed");
