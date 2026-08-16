const STORAGE_KEY = "mozayk-normal-hover";
const CLASS_NAME = "normal-hover";

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

export function getNormalHoverEffects(): boolean {
  return enabled;
}

export function setNormalHoverEffects(next: boolean): void {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  apply(next);
}

/** Applies the saved hover preference before first paint. */
export function initNormalHoverEffects(): void {
  apply(enabled);
}
