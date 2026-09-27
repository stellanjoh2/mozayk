export type ProTip = {
  id: string;
  body: string;
  /** Keyboard keys (or other tokens) to accent in the body. */
  keys?: readonly string[];
};

/** Bump when tip copy/order changes so seen tips reset for everyone. */
const CATALOG_VERSION = 15;

export const PRO_TIPS: readonly ProTip[] = [
  {
    id: "randomize-qw",
    body: "Q randomizes the layout.\nW randomizes the layout and every slider.",
    keys: ["Q", "W"],
  },
  {
    id: "randomize-colours-e",
    body: "E randomizes the current colours only.",
    keys: ["E"],
  },
  {
    id: "pause-colour",
    body: "Hit the pause icon on a colour swatch to keep it while you randomize the rest.",
  },
  {
    id: "grid-density",
    body: "↑ and ↓ change the grid density.",
    keys: ["↑", "↓"],
  },
  {
    id: "toggle-original",
    body: "O toggles the original photo so you can compare while you work.",
    keys: ["O"],
  },
  {
    id: "shape-paint",
    body: "In the Create tab, drag across the shape icons to toggle a whole row at once.",
  },
  {
    id: "drag-pieces",
    body: "Drag any piece on the canvas to rearrange the mosaic — you can only move them to free slots.",
  },
];

const STORAGE_KEY = "mozayk-pro-tips-seen";
const VERSION_KEY = "mozayk-pro-tips-version";
const ENABLED_KEY = "mozayk-pro-tips-enabled";
export const PRO_TIPS_ENABLED_EVENT = "mozayk-pro-tips-enabled";

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

let tipsEnabled = loadEnabled();

function ensureCatalogVersion(): void {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored === String(CATALOG_VERSION)) return;
    localStorage.setItem(VERSION_KEY, String(CATALOG_VERSION));
    localStorage.removeItem(STORAGE_KEY);
    tipsEnabled = true;
    localStorage.setItem(ENABLED_KEY, "1");
    window.dispatchEvent(new Event(PRO_TIPS_ENABLED_EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

ensureCatalogVersion();

/** After the full catalog has been shown, a new page load restarts the sequence. */
function resetSeenIfCatalogExhausted(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const seen = new Set(
      parsed.filter((id): id is string => typeof id === "string"),
    );
    if (PRO_TIPS.every((tip) => seen.has(tip.id))) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

resetSeenIfCatalogExhausted();

export function getProTipsEnabled(): boolean {
  ensureCatalogVersion();
  return tipsEnabled;
}

export function setProTipsEnabled(next: boolean): void {
  tipsEnabled = next;
  try {
    localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
    // Turning tips back on should replay the catalog, not stay stuck on "all seen".
    if (next) localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(PRO_TIPS_ENABLED_EVENT));
}

function loadSeen(): Set<string> {
  ensureCatalogVersion();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Next tip that has not been shown yet, or null when the catalog is done. */
export function nextUnseenProTip(): ProTip | null {
  if (!tipsEnabled) return null;
  const seen = loadSeen();
  return PRO_TIPS.find((tip) => !seen.has(tip.id)) ?? null;
}

export function markProTipSeen(id: string): void {
  const seen = loadSeen();
  if (seen.has(id)) return;
  seen.add(id);
  saveSeen(seen);
}
