import { useMemo } from "react";
import logoSvg from "../assets/mozayk_logo.svg?raw";

/**
 * Must match --logo-fill-1/2/3 in App.css :root.
 * The wordmark paints from these tokens — never from hardcoded hex.
 */
const LOGO_FILL_TOKENS = [
  "var(--logo-fill-1)",
  "var(--logo-fill-2)",
  "var(--logo-fill-3)",
] as const;

const PART_SELECTOR = "rect, circle, polygon, polyline, path, ellipse";
const CELL = 0.5;
const PACK = 1024;

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function attr(el: Element, name: string): number {
  const value = el.getAttribute(name);
  return value == null || value === "" ? 0 : Number(value);
}

function parsePts(el: Element): { x: number; y: number }[] {
  const nums = (el.getAttribute("points") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}

function pointInPoly(x: number, y: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y;
    const yj = pts[j].y;
    if ((yi > y) === (yj > y)) continue;
    const xi = pts[i].x;
    const xj = pts[j].x;
    if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function covers(el: Element, x: number, y: number): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "rect") {
    const rx = attr(el, "x");
    const ry = attr(el, "y");
    return x > rx && x < rx + attr(el, "width") && y > ry && y < ry + attr(el, "height");
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = attr(el, "cx");
    const cy = attr(el, "cy");
    const rx = tag === "ellipse" ? attr(el, "rx") : attr(el, "r");
    const ry = tag === "ellipse" ? attr(el, "ry") : attr(el, "r");
    return x > cx - rx && x < cx + rx && y > cy - ry && y < cy + ry;
  }
  if (tag === "polygon" || tag === "polyline") {
    const pts = parsePts(el);
    return pts.length >= 3 && pointInPoly(x, y, pts);
  }
  return false;
}

function bbox(el: Element): { minX: number; minY: number; maxX: number; maxY: number } {
  const tag = el.tagName.toLowerCase();
  if (tag === "rect") {
    const x = attr(el, "x");
    const y = attr(el, "y");
    return { minX: x, minY: y, maxX: x + attr(el, "width"), maxY: y + attr(el, "height") };
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = attr(el, "cx");
    const cy = attr(el, "cy");
    const rx = tag === "ellipse" ? attr(el, "rx") : attr(el, "r");
    const ry = tag === "ellipse" ? attr(el, "ry") : attr(el, "r");
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  }
  const pts = parsePts(el);
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

function occupancy(el: Element): Set<number> {
  const box = bbox(el);
  const cells = new Set<number>();
  const x0 = Math.floor(box.minX / CELL);
  const x1 = Math.ceil(box.maxX / CELL);
  const y0 = Math.floor(box.minY / CELL);
  const y1 = Math.ceil(box.maxY / CELL);
  for (let ix = x0; ix < x1; ix++) {
    for (let iy = y0; iy < y1; iy++) {
      if (covers(el, (ix + 0.5) * CELL, (iy + 0.5) * CELL)) {
        cells.add(ix * PACK + iy);
      }
    }
  }
  return cells;
}

function shareEdge(a: Set<number>, b: Set<number>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const key of small) {
    const ix = Math.floor(key / PACK);
    const iy = key - ix * PACK;
    if (
      large.has(key) ||
      large.has((ix + 1) * PACK + iy) ||
      large.has((ix - 1) * PACK + iy) ||
      large.has(ix * PACK + iy + 1) ||
      large.has(ix * PACK + iy - 1)
    ) {
      return true;
    }
  }
  return false;
}

function colorGraph(adj: number[][]): number[] {
  const n = adj.length;
  const palette = [0, 1, 2];

  for (let attempt = 0; attempt < 24; attempt++) {
    const colors = new Array<number>(n).fill(-1);
    const order = shuffle([...Array(n).keys()]);
    const options = Array.from({ length: n }, () => shuffle(palette));
    const solve = (i: number): boolean => {
      if (i === n) return true;
      const v = order[i];
      for (const c of options[v]) {
        if (adj[v].some((u) => colors[u] === c)) continue;
        colors[v] = c;
        if (solve(i + 1)) return true;
        colors[v] = -1;
      }
      return false;
    };
    if (solve(0)) return colors;
  }

  const colors = new Array<number>(n).fill(-1);
  for (const v of shuffle([...Array(n).keys()])) {
    const used = new Set(adj[v].map((u) => colors[u]).filter((c) => c >= 0));
    const legal = palette.filter((c) => !used.has(c));
    colors[v] = legal[Math.floor(Math.random() * legal.length)] ?? palette[0];
  }
  return colors;
}

function paintLogoWithBrandTokens(svgMarkup: string): string {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.querySelector("parsererror")) return svgMarkup;

  svg.querySelector("style")?.remove();
  const defs = svg.querySelector("defs");
  if (defs && defs.childElementCount === 0) defs.remove();

  const parts = [...svg.querySelectorAll(PART_SELECTOR)];
  const cells = parts.map(occupancy);
  const adj = parts.map(() => [] as number[]);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!shareEdge(cells[i], cells[j])) continue;
      adj[i].push(j);
      adj[j].push(i);
    }
  }

  const colors = colorGraph(adj);
  parts.forEach((el, i) => {
    el.removeAttribute("class");
    el.setAttribute("fill", LOGO_FILL_TOKENS[colors[i] ?? 0]);
  });

  svg.removeAttribute("id");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "mozayk");
  return new XMLSerializer().serializeToString(svg);
}

export function BrandLogo({ className }: { className?: string }) {
  const html = useMemo(() => paintLogoWithBrandTokens(logoSvg), []);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
