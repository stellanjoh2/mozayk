import { useEffect, useRef } from "react";

const N = 5;
const CENTER = 2;
const CYCLE_MS = 1700 / 1.6;
const BASE_OPACITY = 0.08;
const ORBIT_OPACITY = 0.96;
const NEAR_ORBIT_OPACITY = 0.34;
const CORNERS = new Set(["0,0", "0,4", "4,0", "4,4"]);

function isCorner(row: number, col: number): boolean {
  return CORNERS.has(`${row},${col}`);
}

function dotOpacity(row: number, col: number, phase: number): number {
  const x = col - CENTER;
  const y = row - CENTER;
  const t = phase * Math.PI * 2;
  const angle = Math.atan2(y, x);
  const ring = Math.hypot(x, y);
  const twoPi = Math.PI * 2;
  const angularPhase =
    ((angle - t * 0.95 + Math.PI * 4) % twoPi) / (twoPi / 3);
  const sectorPos = angularPhase - Math.floor(angularPhase);
  const sectorPulse = Math.max(0, 1 - Math.abs(sectorPos - 0.5) * 2);
  const ringPhase = 0.5 + 0.5 * Math.cos(ring * 3.2 + t * 1.7);
  const score = 0.74 * sectorPulse + 0.26 * ringPhase;

  let opacity = BASE_OPACITY;
  if (score > 0.84) opacity = ORBIT_OPACITY;
  else if (score > 0.63) opacity = 0.62;
  else if (score > 0.44) opacity = NEAR_ORBIT_OPACITY;

  if (x === 0 && y === 0) return Math.max(opacity, NEAR_ORBIT_OPACITY);
  return opacity;
}

function paintDots(dots: HTMLElement[], phase: number) {
  for (const dot of dots) {
    const row = Number(dot.dataset.row);
    const col = Number(dot.dataset.col);
    dot.style.opacity = String(dotOpacity(row, col, phase));
  }
}

/** Phase Orb — 5×5 circular dot matrix with an orbiting energy point. */
export function PhaseOrb() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dots = [...root.querySelectorAll<HTMLElement>("[data-orb-cell]")];
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      paintDots(dots, 0);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = ((now - start) % CYCLE_MS + CYCLE_MS) % CYCLE_MS;
      paintDots(dots, elapsed / CYCLE_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} className="phase-orb">
      {Array.from({ length: N * N }, (_, index) => {
        const row = Math.floor(index / N);
        const col = index % N;
        const corner = isCorner(row, col);
        return (
          <span
            key={index}
            className={corner ? "phase-orb__dot is-corner" : "phase-orb__dot"}
            data-orb-cell={corner ? undefined : ""}
            data-row={row}
            data-col={col}
          />
        );
      })}
    </div>
  );
}
