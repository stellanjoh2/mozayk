import { useEffect, useRef } from "react";

const N = 5;
const ROWS = N;
const CYCLE_MS = 1500 / 2.5;
const BASE_OPACITY = 0.08;
const PEAK_OPACITY = 1;
const DECAY = 0.72;
const COL_WARP = 0.07;

function dotOpacity(row: number, col: number, scanRow: number): number {
  const colGain = 1 + COL_WARP * Math.sin(col * 1.72 + scanRow * 0.61);

  if (row > scanRow) {
    return BASE_OPACITY;
  }

  const age = scanRow - row;
  const trail = Math.exp(-age * DECAY);
  const opacity = BASE_OPACITY + (PEAK_OPACITY - BASE_OPACITY) * trail * colGain;
  return Math.min(PEAK_OPACITY, opacity);
}

function staticDotOpacity(row: number): number {
  const falloff = (ROWS - 1 - row) / Math.max(1, ROWS - 1);
  return BASE_OPACITY + falloff * 0.38;
}

function paintDots(dots: HTMLElement[], scanRow: number, reduced: boolean) {
  for (const dot of dots) {
    const row = Number(dot.dataset.row);
    const col = Number(dot.dataset.col);
    dot.style.opacity = String(
      reduced ? staticDotOpacity(row) : dotOpacity(row, col, scanRow),
    );
  }
}

/** CRT Glide — 5×5 dot matrix with a horizontal scanline and phosphor trail. */
export function CrtGlide() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dots = [...root.querySelectorAll<HTMLElement>("[data-glide-cell]")];
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      paintDots(dots, 0, true);
      return;
    }

    const stepMs = CYCLE_MS / ROWS;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = ((now - start) % CYCLE_MS + CYCLE_MS) % CYCLE_MS;
      const scanRow = Math.floor(elapsed / stepMs) % ROWS;
      paintDots(dots, scanRow, false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} className="crt-glide">
      {Array.from({ length: N * N }, (_, index) => {
        const row = Math.floor(index / N);
        const col = index % N;
        return (
          <span
            key={index}
            className="crt-glide__dot"
            data-glide-cell=""
            data-row={row}
            data-col={col}
          />
        );
      })}
    </div>
  );
}
