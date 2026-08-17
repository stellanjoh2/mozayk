export const CHROME_THEMES = ["dark", "light", "purple"] as const;
export type ChromeTheme = (typeof CHROME_THEMES)[number];

export const CHROME_THEME_LABELS: Record<ChromeTheme, string> = {
  dark: "Dark",
  light: "Light",
  purple: "Purple",
};

const STORAGE_KEY = "mozayk-chrome-theme";
const LEGACY_LIGHT_KEY = "mozayk-light-theme";

function isChromeTheme(value: string | null): value is ChromeTheme {
  return CHROME_THEMES.includes(value as ChromeTheme);
}

function loadTheme(): ChromeTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pink") return "purple";
    if (isChromeTheme(stored)) return stored;
    if (localStorage.getItem(LEGACY_LIGHT_KEY) === "1") return "light";
  } catch {
    /* ignore quota / private mode */
  }
  return "dark";
}

function apply(theme: ChromeTheme): void {
  const root = document.documentElement;
  root.classList.remove("light-theme");
  root.dataset.theme = theme;
}

let theme = loadTheme();

export function getChromeTheme(): ChromeTheme {
  return theme;
}

export function setChromeTheme(next: ChromeTheme): void {
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
    localStorage.removeItem(LEGACY_LIGHT_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  apply(next);
}

/** Applies the saved chrome theme before first paint. */
export function initChromeTheme(): void {
  apply(theme);
}
