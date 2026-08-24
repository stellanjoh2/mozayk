import {
  colorLuminance,
  COMMON_PALETTE_PRESETS,
  FERAL_PALETTE_PRESETS,
  PALETTE_PRESET_COLOR_COUNT,
  PALETTE_PRESETS,
  RETRO_PALETTE_PRESETS,
  sortColorsForPreview,
} from "./palettePresets";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  for (const preset of PALETTE_PRESETS) {
    assert(
      preset.colors.length === PALETTE_PRESET_COLOR_COUNT,
      `${preset.id} should have ${PALETTE_PRESET_COLOR_COUNT} colours`,
    );
  }

  assert(COMMON_PALETTE_PRESETS.length > 0, "common presets should exist");
  assert(RETRO_PALETTE_PRESETS.length > 0, "retro presets should exist");
  assert(FERAL_PALETTE_PRESETS.length > 0, "feral presets should exist");
  for (const preset of COMMON_PALETTE_PRESETS) {
    assert(preset.category === "common", `${preset.id} should be common`);
  }
  for (const preset of RETRO_PALETTE_PRESETS) {
    assert(preset.category === "retro", `${preset.id} should be retro`);
  }
  for (const preset of FERAL_PALETTE_PRESETS) {
    assert(preset.category === "feral", `${preset.id} should be feral`);
  }

  const sorted = sortColorsForPreview([
    "#03045E",
    "#CAF0F8",
    "#0077B6",
    "#90E0EF",
    "#48CAE4",
  ]);
  for (let i = 1; i < sorted.length; i++) {
    assert(
      colorLuminance(sorted[i - 1]) >= colorLuminance(sorted[i]),
      "preview colours should descend in luminance (bright top, dark bottom)",
    );
  }

  const gbc = PALETTE_PRESETS.find((preset) => preset.id === "gameboy-color");
  assert(Boolean(gbc), "gameboy-color preset should exist");
  const gbcChromatic = gbc!.colors.filter((hex) => {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) > 80;
  });
  assert(
    gbcChromatic.length >= 3,
    "Game Boy Color should be RGB hues from CGB palettes, not a greenscale",
  );

  const midnight = PALETTE_PRESETS.find((preset) => preset.id === "midnight-bloom");
  assert(Boolean(midnight), "midnight-bloom preset should exist");
  const midnightPreview = sortColorsForPreview(midnight!.colors);
  const pinkIndex = midnightPreview.indexOf("#F72585");
  assert(pinkIndex > 0 && pinkIndex < midnightPreview.length - 1, "pink should sit in the stack");
  const beforePink = midnightPreview[pinkIndex - 1];
  const afterPink = midnightPreview[pinkIndex + 1];
  assert(
    !(beforePink === "#4CC9F0" && afterPink === "#4361EE"),
    "pink should not sit between two blues in Midnight Bloom",
  );
}

run();
console.log("palettePresets tests passed");
