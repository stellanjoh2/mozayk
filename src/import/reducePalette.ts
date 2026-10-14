import type { ImageRgb, ImageSourceData } from "./imageSource";

export const MIN_IMPORT_COLOR_COUNT = 2;

export type ReducedPalette = {
  /** Weighted average colour of each group — used to classify photo pixels. */
  centers: ImageRgb[];
  /** Heaviest original slot per group; its colour stands in for the group. */
  representatives: number[];
  weights: number[];
};

type Group = { center: ImageRgb; weight: number; members: number[] };

function mergeCost(a: Group, b: Group): number {
  const dr = a.center.r - b.center.r;
  const dg = a.center.g - b.center.g;
  const db = a.center.b - b.center.b;
  // Ward linkage: small clusters fold into near neighbours before big ones merge.
  return ((a.weight * b.weight) / (a.weight + b.weight)) * (dr * dr + dg * dg + db * db);
}

function heaviestMember(members: number[], weights: number[]): number {
  let best = members[0]!;
  for (const index of members) {
    if (
      weights[index]! > weights[best]! ||
      (weights[index] === weights[best] && index < best)
    ) {
      best = index;
    }
  }
  return best;
}

/**
 * Deterministically merge the closest pair of colours until `count` remain.
 * Stepping the count back up undoes the merges in reverse order.
 */
export function reducePalette(
  colors: ImageRgb[],
  rawWeights: number[] | undefined,
  count: number,
): ReducedPalette {
  const weights = colors.map((_, i) => {
    const w = rawWeights?.[i];
    return typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1;
  });
  const groups: Group[] = colors.map((center, i) => ({
    center: { ...center },
    weight: weights[i]!,
    members: [i],
  }));
  const target = Math.max(1, Math.min(colors.length, Math.round(count)));

  while (groups.length > target) {
    let bestA = 0;
    let bestB = 1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const cost = mergeCost(groups[a]!, groups[b]!);
        if (cost < bestCost) {
          bestCost = cost;
          bestA = a;
          bestB = b;
        }
      }
    }
    const a = groups[bestA]!;
    const b = groups[bestB]!;
    const weight = a.weight + b.weight;
    groups[bestA] = {
      center: {
        r: (a.center.r * a.weight + b.center.r * b.weight) / weight,
        g: (a.center.g * a.weight + b.center.g * b.weight) / weight,
        b: (a.center.b * a.weight + b.center.b * b.weight) / weight,
      },
      weight,
      members: [...a.members, ...b.members],
    };
    groups.splice(bestB, 1);
  }

  const ordered = groups
    .map((group) => ({
      ...group,
      representative: heaviestMember(group.members, weights),
    }))
    .sort((x, y) => x.representative - y.representative);

  return {
    centers: ordered.map((group) => group.center),
    representatives: ordered.map((group) => group.representative),
    weights: ordered.map((group) => group.weight),
  };
}

function luminance(color: ImageRgb): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function indicesByLuminance(colors: ImageRgb[]): number[] {
  return colors
    .map((color, index) => ({ index, lum: luminance(color) }))
    .sort((a, b) => a.lum - b.lum || a.index - b.index)
    .map((entry) => entry.index);
}

/**
 * Theme index for each image slot: pick `centers.length` theme colours spread
 * dark → light and hand them out in the same tonal order as the image groups.
 */
export function themeIndicesForSlots(
  centers: ImageRgb[],
  theme: ImageRgb[],
): number[] {
  const n = centers.length;
  const m = theme.length;
  if (n === 0 || m === 0) return [];
  const themeOrder = indicesByLuminance(theme);
  const picks = Array.from({ length: n }, (_, k) => {
    const position = n === 1 ? (m - 1) / 2 : (k * (m - 1)) / (n - 1);
    return themeOrder[Math.min(m - 1, Math.round(position))]!;
  });
  const slots = new Array<number>(n);
  indicesByLuminance(centers).forEach((slot, rank) => {
    slots[slot] = picks[rank]!;
  });
  return slots;
}

/** Highest threshold value — a theme with fewer colours caps it so none repeat. */
export function maxImportColorCount(source: ImageSourceData): number {
  const max = source.paletteRgb.length;
  const theme = source.themeColors?.length ?? 0;
  return theme >= MIN_IMPORT_COLOR_COUNT ? Math.min(max, theme) : max;
}

export function importColorCount(source: ImageSourceData): number {
  const max = maxImportColorCount(source);
  const count = source.colorCount;
  if (typeof count !== "number" || !Number.isFinite(count)) return max;
  return Math.max(Math.min(MIN_IMPORT_COLOR_COUNT, max), Math.min(max, Math.round(count)));
}

export function reducedImportPalette(source: ImageSourceData): ReducedPalette {
  return reducePalette(
    source.paletteRgb,
    source.paletteWeights,
    importColorCount(source),
  );
}

/** Photo-extracted hex per reduced slot (heaviest member's original colour). */
export function reducedPhotoColors(source: ImageSourceData): string[] {
  if (source.paletteRgb.length === 0) return source.palette;
  return reducedImportPalette(source).representatives.map(
    (index) => source.palette[index] ?? source.palette[0] ?? "#000000",
  );
}
