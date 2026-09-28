/**
 * Temporarily solidify glass UI (`backdrop-filter` panels) while a heavy
 * full-viewport effect runs. Chrome recomposites every frost layer when the
 * mosaic under them changes, or when another backdrop-filter mounts — which
 * reads as the whole chrome blinking.
 */
const CLASS = "is-frost-paused";

let pauseCount = 0;

export function pauseFrost(): () => void {
  const root = document.documentElement;
  pauseCount += 1;
  root.classList.add(CLASS);
  return () => {
    pauseCount = Math.max(0, pauseCount - 1);
    if (pauseCount === 0) root.classList.remove(CLASS);
  };
}
