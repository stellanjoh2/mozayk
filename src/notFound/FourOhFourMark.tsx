import { useEffect, useState } from "react";

const FONT_FAMILY =
  '"Bitcount Grid Single Variable", "Bitcount Grid Single", ui-monospace, monospace';
/** Probe size — viewBox is derived from ink bounds, then scaled via CSS. */
const PROBE_SIZE = 200;
/** Tiny pad in user units so antialiased edges aren’t clipped. */
const INK_PAD = 0.75;
/** One seamless strip — font mono spacing loops cleanly. */
export const FOUR_OH_FOUR_STRIP = "404404404404";
const UNIT = "404";

export type FourOhFourMetrics = {
  viewBox: string;
  /** Strip ink width / ink height. */
  aspect: number;
  /** Single “404” ink width / ink height — drives mark height + CTA. */
  unitAspect: number;
  /**
   * Horizontal center of the first “0” as a 0–1 fraction of one unit’s
   * ink width — parks the CTA in the hole.
   */
  ctaAt: number;
  text: string;
};

let cached: FourOhFourMetrics | null = null;
let inflight: Promise<FourOhFourMetrics> | null = null;

function fallbackMetrics(): FourOhFourMetrics {
  return {
    viewBox: `0 0 ${PROBE_SIZE * 8} ${PROBE_SIZE}`,
    aspect: 8,
    unitAspect: 2,
    ctaAt: 0.5,
    text: FOUR_OH_FOUR_STRIP,
  };
}

type InkBox = { x: number; y: number; width: number; height: number };

function measureInk(label: string, box: DOMRect): InkBox | null {
  const scale = 2;
  const pad = 40;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.width * scale) + pad * 2;
  canvas.height = Math.ceil(box.height * scale) + pad * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    pad - box.x * scale,
    pad - box.y * scale,
  );
  ctx.fillStyle = "#fff";
  ctx.font = `400 ${PROBE_SIZE}px ${FONT_FAMILY}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(label, 0, 0);

  const { width: cw, height: ch } = canvas;
  const data = ctx.getImageData(0, 0, cw, ch).data;
  let minX = cw;
  let maxX = -1;
  let minY = ch;
  let maxY = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4]! > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const toUserX = (cx: number) => (cx - pad) / scale + box.x;
  const toUserY = (cy: number) => (cy - pad) / scale + box.y;
  return {
    x: toUserX(minX),
    y: toUserY(minY),
    width: toUserX(maxX + 1) - toUserX(minX),
    height: toUserY(maxY + 1) - toUserY(minY),
  };
}

function probeText(label: string): {
  box: DOMRect;
  zeroCenter: number;
} | null {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", "0");
  text.setAttribute("y", "0");
  text.setAttribute("font-size", String(PROBE_SIZE));
  text.setAttribute("font-family", FONT_FAMILY);
  text.setAttribute("font-weight", "400");
  text.setAttribute("fill", "#fff");
  text.textContent = label;
  svg.appendChild(text);
  document.body.appendChild(svg);
  const box = text.getBBox();

  let zeroCenter = box.x + box.width * 0.5;
  try {
    // First “0” in “404…” is char index 1.
    if (text.getNumberOfChars() >= 2) {
      const mid = text.getExtentOfChar(1);
      zeroCenter = mid.x + mid.width * 0.5;
    }
  } catch {
    /* keep midpoint fallback */
  }

  document.body.removeChild(svg);
  if (box.width <= 0 || box.height <= 0) return null;
  return { box, zeroCenter };
}

function measure(): FourOhFourMetrics {
  const unitProbe = probeText(UNIT);
  const stripProbe = probeText(FOUR_OH_FOUR_STRIP);
  if (!unitProbe || !stripProbe) return fallbackMetrics();

  const unitInk = measureInk(UNIT, unitProbe.box);
  const stripInk = measureInk(FOUR_OH_FOUR_STRIP, stripProbe.box);

  const unitX = (unitInk ? unitInk.x : unitProbe.box.x) - INK_PAD;
  const unitW = (unitInk ? unitInk.width : unitProbe.box.width) + INK_PAD * 2;
  // No vertical pad — ink sits flush on the top/bottom edges of the mark.
  const unitH = unitInk ? unitInk.height : unitProbe.box.height;
  const ctaAt = (unitProbe.zeroCenter - unitX) / unitW;

  const x = (stripInk ? stripInk.x : stripProbe.box.x) - INK_PAD;
  const y = stripInk ? stripInk.y : stripProbe.box.y;
  const width = (stripInk ? stripInk.width : stripProbe.box.width) + INK_PAD * 2;
  const height = stripInk ? stripInk.height : stripProbe.box.height;

  return {
    viewBox: `${x} ${y} ${width} ${height}`,
    aspect: width / height,
    unitAspect: unitW / unitH,
    ctaAt: Number.isFinite(ctaAt) ? ctaAt : 0.5,
    text: FOUR_OH_FOUR_STRIP,
  };
}

export async function loadFourOhFourMetrics(): Promise<FourOhFourMetrics> {
  if (cached) return cached;
  if (!inflight) {
    inflight = (async () => {
      try {
        await document.fonts.load(`${PROBE_SIZE}px ${FONT_FAMILY}`);
      } catch {
        /* fall through — measure with fallback */
      }
      await document.fonts.ready;
      cached = measure();
      return cached;
    })();
  }
  return inflight;
}

export function useFourOhFourMetrics(): FourOhFourMetrics | null {
  const [metrics, setMetrics] = useState<FourOhFourMetrics | null>(cached);
  useEffect(() => {
    let alive = true;
    void loadFourOhFourMetrics().then((next) => {
      if (alive) setMetrics(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return metrics;
}

/** Real Bitcount strip — continuous “404404404404” for a clean marquee loop. */
export function FourOhFourMark({
  viewBox,
  text,
  className,
}: {
  viewBox: string;
  text: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <text
        x="0"
        y="0"
        fontSize={PROBE_SIZE}
        fontFamily={FONT_FAMILY}
        fontWeight={400}
        fill="#fff"
      >
        {text}
      </text>
    </svg>
  );
}
