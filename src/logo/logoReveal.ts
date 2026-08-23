import { LOGO_FILL_TOKENS } from "./paintLogo";

export const LOGO_WHITE = "#ffffff";
export const LOGO_WIDTH = 292.5;
export const LOGO_HEIGHT = 45;
export const PNG_SCALE = 16;
export const PIECE_SELECTOR = "rect, circle, polygon, polyline, path, ellipse";
export const LOOP_POOL_MAX = 20;
export const SPEEDS = { ultra: 1, fast: 2, slow: 5 } as const;
export const SPEED_KEYS = ["ultra", "fast", "slow"] as const;
export type Speed = (typeof SPEED_KEYS)[number];
export const SPEED_LABELS: Record<Speed, string> = {
  ultra: "Ultra",
  fast: "Fast",
  slow: "Slow",
};

export function resolveLogoSvg(markup: string, chromatic: readonly string[]): string {
  let svg = markup;
  LOGO_FILL_TOKENS.forEach((token, i) => {
    svg = svg.replaceAll(token, i < 3 ? chromatic[i]! : LOGO_WHITE);
  });
  return svg;
}

export function setPieceVisible(el: SVGElement, visible: boolean): void {
  el.style.transition = "none";
  // Opacity 0 / visibility:hidden still rasterize coverage — white tiles leak
  // 1px ghosts on black. display:none drops them from painting entirely.
  el.style.opacity = "";
  el.style.fill = visible ? "" : "none";
  el.style.visibility = visible ? "visible" : "hidden";
  el.style.display = visible ? "" : "none";
  if (visible) {
    el.removeAttribute("visibility");
    el.removeAttribute("display");
  } else {
    el.setAttribute("visibility", "hidden");
    el.setAttribute("display", "none");
  }
}

function pieceBox(el: Element): { x: number; y: number } {
  const svgEl = el as SVGElement;
  const wasHidden = svgEl.style.display === "none" || svgEl.getAttribute("display") === "none";
  if (wasHidden) {
    svgEl.style.display = "";
    svgEl.removeAttribute("display");
  }
  try {
    const box = (el as SVGGraphicsElement).getBBox();
    return { x: box.x, y: box.y };
  } catch {
    return { x: 0, y: 0 };
  } finally {
    if (wasHidden) {
      svgEl.style.display = "none";
      svgEl.setAttribute("display", "none");
    }
  }
}

/** Unique L→R order (T→B on ties). Each piece gets its own time slot. */
export function logoPieces(svg: Element): { el: SVGElement; t: number }[] {
  const parts = [...svg.querySelectorAll(PIECE_SELECTOR)] as SVGElement[];
  if (parts.length === 0) return [];
  const ranked = parts
    .map((el) => ({ el, ...pieceBox(el) }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const last = ranked.length - 1;
  return ranked.map((item, i) => ({ el: item.el, t: last === 0 ? 0 : i / last }));
}

/** One loop: construct 0..phase, deconstruct phase..2phase, both L→R. */
export function pieceOnInLoop(t: number, timeMs: number, phaseMs: number): boolean {
  return timeMs >= t * phaseMs && timeMs < phaseMs + t * phaseMs;
}
