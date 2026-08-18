export const CHROME_APPEARANCES = ["dark", "light"] as const;
export type ChromeAppearance = (typeof CHROME_APPEARANCES)[number];

export const CHROME_APPEARANCE_LABELS: Record<ChromeAppearance, string> = {
  dark: "Dark",
  light: "Light",
};

export const CHROME_COLORS = ["orange", "purple"] as const;
export type ChromeColor = (typeof CHROME_COLORS)[number];

export const CHROME_COLOR_LABELS: Record<ChromeColor, string> = {
  orange: "Orange",
  purple: "Purple",
};

const THEME_KEY = "mozayk-chrome-theme";
const COLOR_KEY = "mozayk-chrome-color";
const LEGACY_LIGHT_KEY = "mozayk-light-theme";

function isAppearance(value: string | null): value is ChromeAppearance {
  return CHROME_APPEARANCES.includes(value as ChromeAppearance);
}

function isColor(value: string | null): value is ChromeColor {
  return CHROME_COLORS.includes(value as ChromeColor);
}

function loadAppearance(): ChromeAppearance {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "pink" || stored === "purple") return "dark";
    if (isAppearance(stored)) return stored;
    if (localStorage.getItem(LEGACY_LIGHT_KEY) === "1") return "light";
  } catch {
    /* ignore quota / private mode */
  }
  return "dark";
}

function loadColor(): ChromeColor {
  try {
    const stored = localStorage.getItem(COLOR_KEY);
    if (isColor(stored)) return stored;
    const theme = localStorage.getItem(THEME_KEY);
    if (theme === "pink" || theme === "purple") return "purple";
  } catch {
    /* ignore quota / private mode */
  }
  return "orange";
}

function persist(): void {
  try {
    localStorage.setItem(THEME_KEY, appearance);
    localStorage.setItem(COLOR_KEY, color);
    localStorage.removeItem(LEGACY_LIGHT_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

function apply(): void {
  const root = document.documentElement;
  root.classList.remove("light-theme");
  root.dataset.theme = appearance;
  root.dataset.chrome = color;
}

let appearance = loadAppearance();
let color = loadColor();

export function getChromeAppearance(): ChromeAppearance {
  return appearance;
}

export function getChromeColor(): ChromeColor {
  return color;
}

export function setChromeAppearance(next: ChromeAppearance): void {
  appearance = next;
  persist();
  apply();
}

export function setChromeColor(next: ChromeColor): void {
  color = next;
  persist();
  apply();
}

/** Applies the saved chrome theme before first paint. */
export function initChromeTheme(): void {
  apply();
}

let colorProbe: HTMLSpanElement | null = null;

/** Resolve a CSS custom property to a computed rgb/rgba colour for canvas. */
export function resolveCssColor(varName: string, fallback = "#ff5300"): string {
  if (typeof document === "undefined") return fallback;
  if (!colorProbe) {
    colorProbe = document.createElement("span");
    colorProbe.setAttribute("hidden", "");
    colorProbe.style.position = "absolute";
    colorProbe.style.width = "0";
    colorProbe.style.height = "0";
    colorProbe.style.overflow = "hidden";
    colorProbe.style.pointerEvents = "none";
    document.documentElement.appendChild(colorProbe);
  }
  colorProbe.style.color = `var(${varName})`;
  const resolved = getComputedStyle(colorProbe).color;
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : fallback;
}
