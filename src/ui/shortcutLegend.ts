const STORAGE_KEY = "mozayk-shortcut-legend";

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}

let enabled = loadEnabled();

export function getShortcutLegendEnabled(): boolean {
  return enabled;
}

export function setShortcutLegendEnabled(next: boolean): void {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
