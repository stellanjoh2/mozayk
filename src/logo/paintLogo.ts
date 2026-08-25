/**
 * Must match --logo-fill-1/2/3/4 in App.css :root
 * (blue / purple / orange / white — not UI --brand, --chrome, or --brand-green).
 * The wordmark paints from these tokens — never from hardcoded hex.
 */
export const LOGO_FILL_TOKENS = [
  "var(--logo-fill-1)",
  "var(--logo-fill-2)",
  "var(--logo-fill-3)",
  "var(--logo-fill-4)",
] as const;
const WHITE_FILL_INDEX = 3;

const PART_SELECTOR = "rect, circle, polygon, polyline, path, ellipse";
const CELL = 0.5;
const PACK = 1024;
const GRID = 9;
const UNIT_KINDS = ["square", "circle", "triangle"] as const;
/** Relative mix boxes : spheres : triangles — boxes stay dominant (≈50/25/25). */
const UNIT_KIND_WEIGHTS = { square: 66, circle: 33, triangle: 33 } as const;
/** White dominant (60%); three chromatics at 10% each — all four always used. */
const COLOR_WEIGHTS = [10, 10, 10, 60] as const;
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

/** Largest-remainder counts from relative weights. */
function weightedCounts(count: number, weights: readonly number[]): number[] {
  const totalW = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (count * w) / totalW);
  const floors = exact.map((n) => Math.floor(n));
  const rem = count - floors.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) floors[byFrac[k].i]++;
  return floors;
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

function adjacency(cells: Set<number>[]): number[][] {
  const n = cells.length;
  const at = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    for (const key of cells[i]) {
      const list = at.get(key);
      if (list) list.push(i);
      else at.set(key, [i]);
    }
  }
  const adj = Array.from({ length: n }, () => [] as number[]);
  const linked = Array.from({ length: n }, () => new Set<number>());
  const link = (i: number, j: number) => {
    if (i === j || linked[i].has(j)) return;
    linked[i].add(j);
    linked[j].add(i);
    adj[i].push(j);
    adj[j].push(i);
  };
  for (let i = 0; i < n; i++) {
    for (const key of cells[i]) {
      const ix = Math.floor(key / PACK);
      const iy = key - ix * PACK;
      for (const nkey of [
        key,
        (ix + 1) * PACK + iy,
        (ix - 1) * PACK + iy,
        ix * PACK + iy + 1,
        ix * PACK + iy - 1,
      ]) {
        const hits = at.get(nkey);
        if (!hits) continue;
        for (const j of hits) link(i, j);
      }
    }
  }
  return adj;
}

function boxCenter(box: Box): { cx: number; cy: number } {
  return { cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2 };
}

/** Split mosaic parts into letterforms by centre-x gutters between glyphs. */
function letterClusters(boxes: Box[], unitSize: number): number[][] {
  const indexed = boxes
    .map((box, i) => ({ i, cx: boxCenter(box).cx }))
    .sort((a, b) => a.cx - b.cx);
  if (indexed.length === 0) return [];
  const letters: number[][] = [];
  let cur = [indexed[0].i];
  let maxCx = indexed[0].cx;
  for (let k = 1; k < indexed.length; k++) {
    const gap = indexed[k].cx - maxCx;
    if (gap > unitSize + 0.5) {
      letters.push(cur);
      cur = [indexed[k].i];
      maxCx = indexed[k].cx;
    } else {
      cur.push(indexed[k].i);
      maxCx = Math.max(maxCx, indexed[k].cx);
    }
  }
  letters.push(cur);
  return letters;
}

function axisAlignedNeighbor(boxes: Box[], i: number, j: number, unitSize: number): boolean {
  const a = boxCenter(boxes[i]);
  const b = boxCenter(boxes[j]);
  const dx = Math.abs(a.cx - b.cx);
  const dy = Math.abs(a.cy - b.cy);
  return (dy < 1 && Math.abs(dx - unitSize) < 1) || (dx < 1 && Math.abs(dy - unitSize) < 1);
}

/**
 * Collinear same-colour tiles that collapse into one rect.
 * Coarse: one run of 2–4 cells per letter.
 * Subdivided: a few runs of 2–4 cells (occasionally a bit longer), not 1×1 and not full-letter bars.
 */
function pickSameColorRuns(adj: number[][], boxes: Box[], unitSize: number): number[][] {
  const subdivided = unitSize < GRID - 0.5;
  const minLen = 2;
  const maxLen = subdivided ? 6 : 4;
  const runsWanted = subdivided ? 3 : 1;
  const runs: number[][] = [];
  for (const letter of letterClusters(boxes, unitSize)) {
    const set = new Set(letter);
    const axisAdj = new Map<number, number[]>();
    for (const i of letter) axisAdj.set(i, []);
    for (const i of letter) {
      for (const j of adj[i]) {
        if (!set.has(j) || j <= i) continue;
        if (!axisAlignedNeighbor(boxes, i, j, unitSize)) continue;
        axisAdj.get(i)!.push(j);
        axisAdj.get(j)!.push(i);
      }
    }

    const candidates: number[][] = [];
    const seen = new Set<string>();
    const dfs = (path: number[]) => {
      if (path.length >= minLen && path.length <= maxLen) {
        const key = [...path].sort((a, b) => a - b).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push([...path]);
        }
      }
      if (path.length === maxLen) return;
      const last = path[path.length - 1];
      for (const next of axisAdj.get(last) ?? []) {
        if (path.includes(next)) continue;
        if (path.length >= 2) {
          const a = boxCenter(boxes[path[0]]);
          const b = boxCenter(boxes[path[1]]);
          const c = boxCenter(boxes[next]);
          const horiz = Math.abs(a.cy - b.cy) < 1;
          if (horiz ? Math.abs(c.cy - a.cy) >= 1 : Math.abs(c.cx - a.cx) >= 1) continue;
        }
        dfs([...path, next]);
      }
    };
    for (const start of letter) dfs([start]);
    if (candidates.length === 0) continue;

    const used = new Set<number>();
    for (let n = 0; n < runsWanted; n++) {
      const available = candidates.filter((r) => r.every((i) => !used.has(i)));
      if (available.length === 0) break;
      const lengths = [...new Set(available.map((r) => r.length))];
      const short = lengths.filter((len) => len <= 4);
      const poolLens =
        subdivided && short.length > 0 && Math.random() < 0.85 ? short : lengths;
      const len = poolLens[Math.floor(Math.random() * poolLens.length)]!;
      const pool = available.filter((r) => r.length === len);
      const picked = pool[Math.floor(Math.random() * pool.length)]!;
      runs.push(picked);
      for (const i of picked) used.add(i);
    }
  }
  return runs;
}

function colorGraph(adj: number[][], runs: number[][] = []): number[] {
  const n = adj.length;
  const groupOf = new Array<number>(n).fill(-1);
  for (let gi = 0; gi < runs.length; gi++) {
    for (const v of runs[gi]) groupOf[v] = gi;
  }
  const membersOf = (v: number) => (groupOf[v] >= 0 ? runs[groupOf[v]] : [v]);

  const palette = [...LOGO_FILL_TOKENS.keys()];
  const quota = weightedCounts(n, COLOR_WEIGHTS);
  // Guarantee every colour appears at least once when the graph is large enough.
  if (n >= palette.length) {
    for (let c = 0; c < palette.length; c++) {
      if (quota[c] > 0) continue;
      const donor = quota
        .map((q, i) => ({ q, i }))
        .filter(({ i }) => i !== c && quota[i] > 1)
        .sort((a, b) => b.q - a.q)[0];
      if (!donor) continue;
      quota[donor.i]--;
      quota[c]++;
    }
  }

  const neighborColors = (members: number[], colors: number[]): Set<number> => {
    const used = new Set<number>();
    for (const m of members) {
      for (const u of adj[m]) {
        if (groupOf[m] >= 0 && groupOf[u] === groupOf[m]) continue;
        if (colors[u] >= 0) used.add(colors[u]);
      }
    }
    return used;
  };

  for (let attempt = 0; attempt < (n > 140 ? 0 : 48); attempt++) {
    const remaining = [...quota];
    const colors = new Array<number>(n).fill(-1);
    const order = shuffle([...Array(n).keys()]);
    let steps = 0;
    const solve = (i: number): boolean => {
      if (i === n) return true;
      if (++steps > 12_000) return false;
      const v = order[i];
      if (colors[v] >= 0) return solve(i + 1);
      const members = membersOf(v);
      const used = neighborColors(members, colors);
      const inQuota = shuffle(palette.filter((c) => remaining[c] > 0 && !used.has(c)));
      const options =
        inQuota.length > 0 ? inQuota : shuffle(palette.filter((c) => !used.has(c)));
      for (const c of options) {
        const took = Math.min(remaining[c], members.length);
        remaining[c] -= took;
        for (const m of members) colors[m] = c;
        if (solve(i + 1)) return true;
        for (const m of members) colors[m] = -1;
        remaining[c] += took;
      }
      return false;
    };
    if (solve(0)) return colors;
  }

  const remaining = [...quota];
  const colors = new Array<number>(n).fill(-1);
  for (const v of shuffle([...Array(n).keys()])) {
    if (colors[v] >= 0) continue;
    const members = membersOf(v);
    const used = neighborColors(members, colors);
    const legal = palette.filter((c) => !used.has(c));
    const preferred = legal.filter((c) => remaining[c] > 0);
    const pool = preferred.length > 0 ? preferred : legal;
    const ranked = [...pool].sort(
      (a, b) => remaining[b] - remaining[a] || Math.random() - 0.5,
    );
    const c = ranked[0] ?? WHITE_FILL_INDEX;
    for (const m of members) colors[m] = c;
    remaining[c] = Math.max(0, remaining[c] - members.length);
  }
  return colors;
}

function isUnitCell(box: Box, unitSize = GRID): boolean {
  return (
    Math.abs(box.maxX - box.minX - unitSize) < 0.2 &&
    Math.abs(box.maxY - box.minY - unitSize) < 0.2
  );
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
  const floors = weightedCounts(
    count,
    UNIT_KINDS.map((kind) => UNIT_KIND_WEIGHTS[kind]),
  );

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

function unitSlots(svg: Element, unitSize: number): { el: Element; box: Box }[] {
  const slots: { el: Element; box: Box }[] = [];
  for (const el of svg.querySelectorAll(PART_SELECTOR)) {
    const box = bbox(el);
    if (!isUnitCell(box, unitSize)) continue;
    slots.push({ el, box });
  }
  return slots;
}

function quadrantBoxes(box: Box): Box[] {
  const midX = (box.minX + box.maxX) / 2;
  const midY = (box.minY + box.maxY) / 2;
  return [
    { minX: box.minX, minY: box.minY, maxX: midX, maxY: midY },
    { minX: midX, minY: box.minY, maxX: box.maxX, maxY: midY },
    { minX: box.minX, minY: midY, maxX: midX, maxY: box.maxY },
    { minX: midX, minY: midY, maxX: box.maxX, maxY: box.maxY },
  ];
}

function subdivideUnitCells(svg: Element, slots: { el: Element; box: Box }[]): void {
  const doc = svg.ownerDocument;
  if (!doc) return;
  for (const { el, box } of slots) {
    const parent = el.parentNode;
    if (!parent) continue;
    for (const quad of quadrantBoxes(box)) {
      parent.insertBefore(makeUnitModule(doc, { kind: "square", corner: "tr" }, quad), el);
    }
    el.remove();
  }
}

function morphUnitModules(svg: Element, unitSize: number, triangleCorners: Corner[]): void {
  const doc = svg.ownerDocument;
  if (!doc) return;
  const slots = unitSlots(svg, unitSize);
  const shapes = unitShapeBag(slots.length, triangleCorners);
  slots.forEach((slot, i) => {
    slot.el.replaceWith(makeUnitModule(doc, shapes[i], slot.box));
  });
}

/** Replace each same-colour square run with a single rect spanning their union. */
function mergeColorRuns(
  doc: Document,
  parts: Element[],
  boxes: Box[],
  colors: number[],
  runs: number[][],
): void {
  for (const run of runs) {
    if (run.length < 2) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const i of run) {
      const b = boxes[i];
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    const rect = doc.createElementNS(NS, "rect");
    rect.setAttribute("x", String(minX));
    rect.setAttribute("y", String(minY));
    rect.setAttribute("width", String(maxX - minX));
    rect.setAttribute("height", String(maxY - minY));
    rect.setAttribute("fill", LOGO_FILL_TOKENS[colors[run[0]] ?? 0]);
    parts[run[0]].replaceWith(rect);
    for (let k = 1; k < run.length; k++) parts[run[k]].remove();
  }
}

export function paintLogoWithBrandTokens(
  svgMarkup: string,
  options?: { subdivide?: boolean },
): string {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.querySelector("parsererror")) return svgMarkup;

  svg.querySelector("style")?.remove();
  const defs = svg.querySelector("defs");
  if (defs && defs.childElementCount === 0) defs.remove();

  const subdivide = Boolean(options?.subdivide);
  const coarse = unitSlots(svg, GRID);
  const triangleCorners = collectTriangleCorners(coarse);
  if (subdivide) subdivideUnitCells(svg, coarse);
  const unitSize = subdivide ? GRID / 2 : GRID;
  morphUnitModules(svg, unitSize, triangleCorners);

  const parts = [...svg.querySelectorAll(PART_SELECTOR)];
  const cells = parts.map(occupancy);
  const boxes = parts.map(bbox);
  const adj = adjacency(cells);

  const runs = pickSameColorRuns(adj, boxes, unitSize);
  const colors = colorGraph(adj, runs);
  parts.forEach((el, i) => {
    el.removeAttribute("class");
    el.setAttribute("fill", LOGO_FILL_TOKENS[colors[i] ?? 0]);
  });
  // Collapse each same-colour square run into one rect — no shared edges, no seams.
  mergeColorRuns(doc, parts, boxes, colors, runs);

  svg.removeAttribute("id");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "mozayk");
  return new XMLSerializer().serializeToString(svg);
}
