const STORAGE_KEY = "mozayk-normal-cursor";
const CLASS_NAME = "normal-cursor";

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function apply(enabled: boolean): void {
  document.documentElement.classList.toggle(CLASS_NAME, enabled);
}

let enabled = loadEnabled();

export function getNormalCursor(): boolean {
  return enabled;
}

export function setNormalCursor(next: boolean): void {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  apply(next);
}

/** Applies the saved cursor preference before first paint. */
export function initNormalCursor(): void {
  apply(enabled);
}
