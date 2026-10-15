import logoSvg from "../assets/mozayk_logo.svg?raw";
import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  logoPieces,
  pieceOnInLoop,
  setPieceVisible,
  SPEEDS,
} from "../logo/logoReveal";
import { paintLogoWithBrandTokens } from "../logo/paintLogo";
import { pauseFrost } from "../ui/frostPause";
import "./entryIntro.css";

const PHASE_MS = SPEEDS.ultra * 1000;
const LOOP_MS = PHASE_MS * 2;
/** Must match the #entry-veil.is-lifting animation in index.html. */
const LIFT_MS = 1100;
/** Default chromatics — same hex as brand.css :root. */
const FALLBACK_FILLS = ["#2e1ebc", "#cf41f2", "#ff5300"] as const;

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Pin fills on the mark so App.css light-theme remap cannot grey the tiles. */
function pinIntroFills(el: HTMLElement): void {
  const src = getComputedStyle(document.documentElement);
  for (let i = 1; i <= 3; i++) {
    const value = src.getPropertyValue(`--logo-fill-${i}`).trim();
    el.style.setProperty(`--logo-fill-${i}`, value || FALLBACK_FILLS[i - 1]!);
  }
  el.style.setProperty("--logo-fill-4", "#ffffff");
}

/**
 * One Ultra-speed logotype loop on the black entry veil (build, then teardown,
 * both left to right). Resolves once the mark is gone and the veil is pure black.
 * Driven by frame time, not timers, so a busy main thread skips ahead instead of
 * drifting or leaving stale tiles lit.
 */
export function playEntryIntro(): Promise<void> {
  const veil = document.getElementById("entry-veil");
  if (!veil || reducedMotion()) return Promise.resolve();

  const mark = document.createElement("div");
  mark.className = "entry-intro";
  mark.setAttribute("aria-hidden", "true");
  mark.style.visibility = "hidden";
  mark.style.width = "66vw";
  mark.style.aspectRatio = `${LOGO_WIDTH} / ${LOGO_HEIGHT}`;
  pinIntroFills(mark);
  mark.innerHTML = paintLogoWithBrandTokens(logoSvg);
  const svg = mark.querySelector("svg");
  if (!svg) return Promise.resolve();
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Measured while the mark is hidden, then every tile starts off — no full-logo flash.
  veil.append(mark);
  const pieces = logoPieces(svg);
  const lit = pieces.map(() => false);
  for (const { el } of pieces) setPieceVisible(el, false);
  mark.style.visibility = "";

  return new Promise((resolve) => {
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      pieces.forEach(({ el, t }, i) => {
        const on = elapsed < LOOP_MS && pieceOnInLoop(t, elapsed, PHASE_MS);
        if (on === lit[i]) return;
        lit[i] = on;
        setPieceVisible(el, on);
      });
      if (elapsed >= LOOP_MS) {
        mark.remove();
        // Let the empty veil paint before boot/mount can hitch on the last tile.
        requestAnimationFrame(() => resolve());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Fades the black veil off the mounted app. */
export async function liftEntryVeil(): Promise<void> {
  const veil = document.getElementById("entry-veil");
  if (!veil) return;
  if (reducedMotion()) {
    veil.remove();
    return;
  }
  await nextFrame();
  await nextFrame();

  const resumeFrost = pauseFrost();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    veil.remove();
    resumeFrost();
  };
  veil.addEventListener("animationend", finish, { once: true });
  window.setTimeout(finish, LIFT_MS + 300);
  veil.classList.add("is-lifting");
}
