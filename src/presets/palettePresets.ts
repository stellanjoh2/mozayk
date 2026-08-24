export type PaletteCategory = "common" | "retro" | "feral";

export type PalettePreset = {
  id: string;
  label: string;
  category: PaletteCategory;
  colors: string[];
  colorAmounts?: number[];
};

export const PALETTE_PRESET_COLOR_COUNT = 5;

function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance — used to order preview swatches light → dark. */
export function colorLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = parseHexColor(hex);
  if (!rgb) return { h: 0, s: 0, l: 0 };
  const [r, g, b] = rgb.map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function isBlueHue(h: number): boolean {
  // Include cyan (~190–195) so a warm accent is not trapped between cyan and blue.
  return h >= 185 && h <= 250;
}

function isWarmHue(h: number): boolean {
  return h >= 310 || h <= 35;
}

/** Brightest at top, darkest at bottom — pleasant vertical falloff for swatches. */
export function sortColorsForPreview(colors: string[]): string[] {
  const items = colors.map((hex) => ({
    hex,
    lum: colorLuminance(hex),
    h: hexToHsl(hex).h,
  }));
  items.sort((a, b) => b.lum - a.lum || a.hex.localeCompare(b.hex));

  // Keep cool hues together — don't trap a warm accent between two blues.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < items.length - 1; i++) {
      const curr = items[i];
      const prev = items[i - 1];
      const next = items[i + 1];
      if (isWarmHue(curr.h) && isBlueHue(prev.h) && isBlueHue(next.h)) {
        const [warm] = items.splice(i, 1);
        let insertAt = i;
        while (insertAt < items.length && isBlueHue(items[insertAt].h)) {
          insertAt++;
        }
        items.splice(insertAt, 0, warm);
        changed = true;
        break;
      }
    }
  }

  return items.map((item) => item.hex);
}

/** Trendy palette presets inspired by curated colour collections. */
export const COMMON_PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "sunset-glow",
    label: "Sunset Glow",
    category: "common",
    colors: ["#FF6B6B", "#FFE66D", "#FF8E53", "#C44569", "#FFA502"],
  },
  {
    id: "ocean-mist",
    label: "Ocean Mist",
    category: "common",
    colors: ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51"],
  },
  {
    id: "midnight-bloom",
    label: "Midnight Bloom",
    category: "common",
    colors: ["#03045E", "#7209B7", "#F72585", "#4CC9F0", "#4361EE"],
  },
  {
    id: "forest-walk",
    label: "Forest Walk",
    category: "common",
    colors: ["#606C38", "#283618", "#FEFAE0", "#DDA15E", "#BC6C25"],
  },
  {
    id: "pastel-dream",
    label: "Pastel Dream",
    category: "common",
    colors: ["#FFC8DD", "#FFAFCC", "#BDE0FE", "#A2D2FF", "#CDB4DB"],
  },
  {
    id: "neon-nights",
    label: "Neon Nights",
    category: "common",
    colors: ["#00F5D4", "#9B5DE5", "#F15BB5", "#FEE440", "#00BBF9"],
  },
  {
    id: "jungle-canopy",
    label: "Jungle Canopy",
    category: "common",
    colors: ["#081C15", "#1B4332", "#40916C", "#74C69D", "#D8F3DC"],
  },
  {
    id: "berry-crush",
    label: "Berry Crush",
    category: "common",
    colors: ["#590D22", "#800F2F", "#C9184A", "#FF4D6D", "#FF758F"],
  },
  {
    id: "arctic-frost",
    label: "Arctic Frost",
    category: "common",
    colors: ["#CAF0F8", "#90E0EF", "#0077B6", "#03045E", "#48CAE4"],
  },
  {
    id: "sage-stone",
    label: "Sage & Stone",
    category: "common",
    colors: ["#D8E2DC", "#A8DADC", "#6C757D", "#495057", "#457B9D"],
  },
  {
    id: "lavender-haze",
    label: "Lavender Haze",
    category: "common",
    colors: ["#E0AAFF", "#C77DFF", "#9D4EDD", "#7B2CBF", "#5A189A"],
  },
  {
    id: "terracotta",
    label: "Terracotta",
    category: "common",
    colors: ["#E07A5F", "#F2CC8F", "#81B29A", "#3D405B", "#F4A261"],
  },
];

/**
 * Retro console palettes — 5-colour picks from Orby Shader Lab hardware decodes.
 * @see https://github.com/stellanjoh2/orby scripts/render/creativeLook*Art.js
 */
export const RETRO_PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "nes-hero",
    label: "NES Hero",
    category: "retro",
    colors: ["#0000FC", "#F83800", "#00B800", "#F8B800", "#F8F8F8"],
  },
  {
    id: "nes-soft",
    label: "NES Soft",
    category: "retro",
    colors: ["#3CBCFC", "#F878F8", "#F87858", "#B8F818", "#FCFCFC"],
  },
  {
    id: "c64-classic",
    label: "C64 Classic",
    category: "retro",
    colors: ["#880000", "#00CC55", "#0000AA", "#EEEE77", "#FFFFFF"],
  },
  {
    id: "c64-neon",
    label: "C64 Neon",
    category: "retro",
    colors: ["#FF7777", "#AAFF66", "#0088FF", "#EEEE77", "#BBBBBB"],
  },
  {
    id: "gameboy-dmg",
    label: "Game Boy DMG",
    category: "retro",
    colors: ["#9BBC0F", "#8BAC0F", "#306230", "#0F380F", "#071821"],
  },
  {
    id: "gameboy-color",
    label: "Game Boy Color",
    category: "retro",
    colors: ["#C4CFA1", "#8B956D", "#4D533C", "#1F1F1F", "#306230"],
  },
  {
    id: "ega-bright",
    label: "EGA Bright",
    category: "retro",
    colors: ["#5555FF", "#55FF55", "#FF5555", "#FFFF55", "#FF55FF"],
  },
  {
    id: "intellivision",
    label: "Intellivision",
    category: "retro",
    colors: ["#002DFF", "#FF3E00", "#00A720", "#FAEA27", "#FFFCFF"],
  },
  {
    id: "vectrex",
    label: "Vectrex",
    category: "retro",
    colors: ["#33FF55", "#22CC44", "#118833", "#006622", "#001100"],
  },
];

/**
 * Feral transmission palettes — glitch, signal breakdown, destroyed tech.
 * Colour language inspired by Marathon-era cyberpunk comms aesthetics.
 */
export const FERAL_PALETTE_PRESETS: PalettePreset[] = [
  {
    id: "carrier-wave",
    label: "Carrier Wave",
    category: "feral",
    colors: ["#D4FF00", "#F5F5F0", "#0A0A0A", "#9933FF", "#2A2A2A"],
  },
  {
    id: "corrupted-frame",
    label: "Corrupted Frame",
    category: "feral",
    colors: ["#DFFF00", "#3D0040", "#FF1493", "#6B006B", "#1A001A"],
  },
  {
    id: "sideband",
    label: "Sideband",
    category: "feral",
    colors: ["#FF5500", "#0033FF", "#00EEFF", "#E8E8E8", "#001A66"],
  },
  {
    id: "signal-loss",
    label: "Signal Loss",
    category: "feral",
    colors: ["#FFB830", "#506080", "#283848", "#101820", "#050508"],
  },
  {
    id: "ghost-signal",
    label: "Ghost Signal",
    category: "feral",
    colors: ["#020802", "#0A1A0A", "#1B4D1B", "#39FF14", "#A0FFA0"],
  },
  {
    id: "dead-channel",
    label: "Dead Channel",
    category: "feral",
    colors: ["#050505", "#141414", "#282828", "#404040", "#FF1133"],
  },
  {
    id: "predator",
    label: "Predator",
    category: "feral",
    colors: ["#FFEE00", "#FF5500", "#EE0000", "#880033", "#0A0055"],
  },
  {
    id: "white-noise",
    label: "White Noise",
    category: "feral",
    colors: ["#FFFFFF", "#C8C8C8", "#808080", "#404040", "#000000"],
  },
  {
    id: "feedback",
    label: "Feedback",
    category: "feral",
    colors: ["#FF006E", "#FF2D00", "#FF8800", "#FF0044", "#CC0033"],
  },
  {
    id: "jam",
    label: "Jam",
    category: "feral",
    colors: ["#FF0040", "#C8FF00", "#0044CC", "#FF6600", "#FF00FF"],
  },
];

export const PALETTE_PRESETS: PalettePreset[] = [
  ...COMMON_PALETTE_PRESETS,
  ...RETRO_PALETTE_PRESETS,
  ...FERAL_PALETTE_PRESETS,
];

export function palettePresetsForCategory(
  category: PaletteCategory,
): PalettePreset[] {
  return PALETTE_PRESETS.filter((preset) => preset.category === category);
}

export function palettePreviewGradient(colors: string[]): string {
  if (colors.length === 0) return "transparent";
  const sorted = sortColorsForPreview(colors);
  const segment = 100 / sorted.length;
  const stops = sorted.flatMap((color, index) => {
    const start = index * segment;
    const end = (index + 1) * segment;
    return [`${color} ${start}%`, `${color} ${end}%`];
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}
