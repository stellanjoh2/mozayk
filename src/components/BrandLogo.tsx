import { useMemo } from "react";
import logoSvg from "../assets/mozayk_logo.svg?raw";

/**
 * Must match --logo-fill-1/2/3/4 in App.css :root
 * (secondary / other / warm / white — not UI --brand or brand-green).
 * The wordmark paints from these tokens — never from hardcoded hex.
 */
const LOGO_FILL_TOKENS = [
  "var(--logo-fill-1)",
  "var(--logo-fill-2)",
  "var(--logo-fill-3)",
  "var(--logo-fill-4)",
] as const;

const PART_SELECTOR = "rect, circle, polygon, polyline, path, ellipse";
const CELL = 0.5;
const PACK = 1024;
const GRID = 9;
const UNIT_KINDS = ["square", "circle", "triangle"] as const;
/** Relative mix boxes : spheres : triangles — boxes stay dominant (≈50/25/25). */
const UNIT_KIND_WEIGHTS = { square: 66, circle: 33, triangle: 33 } as const;
const NS = "http://www.w3.org/2000/svg";

type UnitKind = (typeof UNIT_KINDS)[number];
type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Corner = "tl" | "tr" | "bl" | "br";
type UnitShape = { kind: UnitKind; corner: Corner };

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
  const palette = [...LOGO_FILL_TOKENS.keys()];

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

function isUnitCell(box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return Math.abs(box.maxX - box.minX - GRID) < 0.2 && Math.abs(box.maxY - box.minY - GRID) < 0.2;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.6;
}

function pointCorner(x: number, y: number, box: Box): Corner | null {
  const left = near(x, box.minX);
  const right = near(x, box.maxX);
  const top = near(y, box.minY);
  const bottom = near(y, box.maxY);
  if (left && top) return "tl";
  if (right && top) return "tr";
  if (left && bottom) return "bl";
  if (right && bottom) return "br";
  return null;
}

function isTriangleUnit(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "circle" || tag === "ellipse" || tag === "rect") return false;
  const full = (GRID / CELL) * (GRID / CELL);
  return occupancy(el).size < full * 0.7;
}

function triangleCorner(el: Element, box: Box): Corner {
  const present = new Set<Corner>();
  for (const p of parsePts(el)) {
    const c = pointCorner(p.x, p.y, box);
    if (c) present.add(c);
  }
  const adjacent: Record<Corner, [Corner, Corner]> = {
    tl: ["tr", "bl"],
    tr: ["tl", "br"],
    bl: ["tl", "br"],
    br: ["tr", "bl"],
  };
  for (const c of ["tl", "tr", "bl", "br"] as const) {
    if (present.has(c) && adjacent[c].every((n) => present.has(n))) return c;
  }
  return "tr";
}

function trianglePoints(box: Box, corner: Corner): string {
  const { minX: x, minY: y, maxX, maxY } = box;
  if (corner === "tl") return `${x},${y} ${maxX},${y} ${x},${maxY}`;
  if (corner === "tr") return `${x},${y} ${maxX},${y} ${maxX},${maxY}`;
  if (corner === "bl") return `${x},${y} ${x},${maxY} ${maxX},${maxY}`;
  return `${maxX},${y} ${x},${maxY} ${maxX},${maxY}`;
}

function collectTriangleCorners(slots: { el: Element; box: Box }[]): Corner[] {
  const corners: Corner[] = [];
  for (const { el, box } of slots) {
    if (isTriangleUnit(el)) corners.push(triangleCorner(el, box));
  }
  return corners.length > 0 ? corners : ["tr"];
}

/** Exact bag sized to `count` using 66:33:33 weights (largest remainder). */
function unitShapeBag(count: number, triangleCorners: Corner[]): UnitShape[] {
  const weights = UNIT_KINDS.map((kind) => UNIT_KIND_WEIGHTS[kind]);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (count * w) / totalW);
  const floors = exact.map((n) => Math.floor(n));
  const rem = count - floors.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) floors[byFrac[k].i]++;

  const corners = shuffle([...triangleCorners]);
  let cornerIdx = 0;
  const bag: UnitShape[] = [];
  UNIT_KINDS.forEach((kind, i) => {
    for (let n = 0; n < floors[i]; n++) {
      bag.push({
        kind,
        corner: kind === "triangle" ? corners[cornerIdx++ % corners.length] : "tr",
      });
    }
  });
  return shuffle(bag);
}

function makeUnitModule(doc: Document, shape: UnitShape, box: Box): Element {
  const { minX: x, minY: y, maxX, maxY } = box;
  const w = maxX - x;
  const h = maxY - y;
  if (shape.kind === "square") {
    const el = doc.createElementNS(NS, "rect");
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
    return el;
  }
  if (shape.kind === "circle") {
    const el = doc.createElementNS(NS, "circle");
    el.setAttribute("cx", String(x + w / 2));
    el.setAttribute("cy", String(y + h / 2));
    el.setAttribute("r", String(Math.min(w, h) / 2));
    return el;
  }
  const el = doc.createElementNS(NS, "polygon");
  el.setAttribute("points", trianglePoints(box, shape.corner));
  return el;
}

function morphUnitModules(svg: Element): void {
  const doc = svg.ownerDocument;
  if (!doc) return;
  const slots: { el: Element; box: Box }[] = [];
  for (const el of svg.querySelectorAll(PART_SELECTOR)) {
    const box = bbox(el);
    if (!isUnitCell(box)) continue;
    slots.push({ el, box });
  }
  const shapes = unitShapeBag(slots.length, collectTriangleCorners(slots));
  slots.forEach((slot, i) => {
    slot.el.replaceWith(makeUnitModule(doc, shapes[i], slot.box));
  });
}

function paintLogoWithBrandTokens(svgMarkup: string): string {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.querySelector("parsererror")) return svgMarkup;

  svg.querySelector("style")?.remove();
  const defs = svg.querySelector("defs");
  if (defs && defs.childElementCount === 0) defs.remove();

  morphUnitModules(svg);

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
