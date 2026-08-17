/**
 * Bitcount-style dotted cursors. Run: node cursors/generate.mjs
 * One circle per on-cell; stroke is the contrast halo (no neighbor outline).
 */

const N = 6;
const CELL = 8;
const DOT_R = CELL * 0.40;
const STROKE = 1.6;
const SIZE = N * CELL;
const DISPLAY = 32;

/** @typedef {{ body: string[]; hot: [number, number] }} Cursor */

/** @type {Record<string, Cursor>} */
const CURSORS = {
  default: {
    hot: [0, 0],
    body: [
      "#.....",
      "##....",
      "#.#...",
      "#..#..",
      "#.#.#.",
      "#..#..",
    ],
  },
  pointer: {
    hot: [0, 0],
    body: [
      "##....",
      ".##...",
      "..##..",
      "#..#..",
      ".###..",
      "..##..",
    ],
  },
  grab: {
    hot: [2, 3],
    body: [
      "#.#.#.",
      "#.#.#.",
      ".###.#",
      ".###..",
      "..#...",
      "......",
    ],
  },
  grabbing: {
    hot: [2, 2],
    body: [
      "......",
      ".###..",
      "#####.",
      ".###..",
      "..#...",
      "......",
    ],
  },
  "not-allowed": {
    hot: [2, 2],
    body: [
      ".###..",
      "#.#.#.",
      "#.#.#.",
      "#.#.#.",
      ".###..",
      "......",
    ],
  },
  text: {
    hot: [2, 2],
    body: [
      "#.#.#.",
      "..#...",
      "..#...",
      "..#...",
      "#.#.#.",
      "......",
    ],
  },
  crosshair: {
    hot: [2, 2],
    body: [
      "..#...",
      "..#...",
      "##.##.",
      "..#...",
      "..#...",
      "......",
    ],
  },
  "zoom-in": {
    hot: [2, 2],
    body: [
      ".###..",
      "#.#.#.",
      "#.#.#.",
      "#.#.#.",
      ".###.#",
      ".....#",
    ],
  },
  "zoom-out": {
    hot: [2, 2],
    body: [
      ".###..",
      "#...#.",
      "#.#.#.",
      "#...#.",
      ".###.#",
      ".....#",
    ],
  },
};

function svgFromGrid(body, fill = "#ffffff", outline = "#000000") {
  if (body.length !== N || body.some((row) => row.length !== N)) {
    throw new Error(`body must be ${N}x${N}`);
  }
  const dots = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (body[y][x] !== "#") continue;
      const cx = (x + 0.5) * CELL;
      const cy = (y + 0.5) * CELL;
      dots.push(
        `<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="${fill}" stroke="${outline}" stroke-width="${STROKE}"/>`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${DISPLAY}" height="${DISPLAY}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none">
${dots.join("\n")}
</svg>
`;
}

function hotPx(hot) {
  const scale = DISPLAY / N;
  return [
    Math.round(hot[0] * scale + scale / 2),
    Math.round(hot[1] * scale + scale / 2),
  ];
}

function sheetSvg(entries) {
  const cols = 3;
  const rows = Math.ceil(entries.length / cols);
  const tile = 240;
  const pad = 28;
  const w = cols * tile + pad * 2;
  const h = rows * tile + pad * 2 + 48;
  const tiles = entries
    .map(([name, darkSvg, lightSvg], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * tile;
      const y = pad + 36 + row * tile;
      const inner = (svg) =>
        svg
          .replace(/<\?xml[^>]*>/, "")
          .replace(/<svg[^>]*>/, "")
          .replace("</svg>", "")
          .trim();
      const scale = 88 / SIZE;
      return `<g transform="translate(${x} ${y})">
  <rect width="108" height="176" fill="#0f0f0f"/>
  <rect x="108" width="108" height="176" fill="#e8e8e8"/>
  <g transform="translate(10 24) scale(${scale})">${inner(darkSvg)}</g>
  <g transform="translate(118 24) scale(${scale})">${inner(lightSvg)}</g>
  <text x="108" y="166" text-anchor="middle" fill="#888888" font-size="13" font-family="ui-monospace, monospace">${name}</text>
</g>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#151515"/>
  <text x="${pad}" y="28" fill="#ff5300" font-size="16" font-family="ui-monospace, monospace">mozayk cursors · dark / light</text>
${tiles}
</svg>
`;
}

function previewHtml(cards) {
  const items = cards
    .map(({ name, hot }) => {
      const [hx, hy] = hotPx(hot);
      return `    <button class="card" style="cursor: url('${name}.svg') ${hx} ${hy}, auto">
      <div class="stage">
        <img src="${name}.svg" alt="${name}" width="128" height="128" />
      </div>
      <span>${name}</span>
    </button>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>mozayk cursors</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bitcount+Grid+Single&display=swap" rel="stylesheet" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Bitcount Grid Single", ui-monospace, monospace;
        background: #0f0f0f;
        color: rgba(255,255,255,0.92);
        padding: 32px;
      }
      h1 { font-size: 22px; font-weight: 400; letter-spacing: 0.06em; }
      p { color: rgba(255,255,255,0.45); max-width: 52rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 16px;
        margin: 28px 0 48px;
      }
      .card {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.1);
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0 0 14px;
        text-align: center;
      }
      .card span { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; }
      .stage {
        display: grid;
        place-items: center;
        height: 168px;
        margin-bottom: 12px;
        background-image:
          linear-gradient(#151515, #151515),
          linear-gradient(#e8e8e8, #e8e8e8),
          linear-gradient(45deg, #2e1ebc 25%, #cf41f2 25%, #cf41f2 50%, #ff5300 50%, #ff5300 75%, #41f24b 75%);
        background-size: 33.34% 100%, 33.34% 100%, 33.34% 100%;
        background-position: 0 0, 50% 0, 100% 0;
        background-repeat: no-repeat;
      }
      .stage img { image-rendering: pixelated; }
      .try {
        height: 120px;
        border: 1px dashed rgba(255,255,255,0.22);
        display: grid;
        place-items: center;
        color: rgba(255,255,255,0.45);
        margin-bottom: 16px;
      }
    </style>
  </head>
  <body>
    <h1>mozayk cursors</h1>
    <p>Hover a tile to try that cursor. Each glyph sits on dark / light / brand so you can check contrast. Not wired into the app yet.</p>
    <div class="grid">
${items}
    </div>
  </body>
</html>
`;
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(dir, { recursive: true });

const cards = [];
const sheetEntries = [];
const hotspots = {};

for (const [name, spec] of Object.entries(CURSORS)) {
  const svg = svgFromGrid(spec.body);
  const lightSvg = svgFromGrid(spec.body, "#000000", "#ffffff");
  writeFileSync(join(dir, `${name}.svg`), svg);
  writeFileSync(join(dir, `${name}-light.svg`), lightSvg);
  cards.push({ name, hot: spec.hot });
  sheetEntries.push([name, svg, lightSvg]);
  const [hx, hy] = hotPx(spec.hot);
  hotspots[name] = { cell: spec.hot, px: [hx, hy] };
}

writeFileSync(join(dir, "_preview.html"), previewHtml(cards));
writeFileSync(join(dir, "_sheet.svg"), sheetSvg(sheetEntries));
writeFileSync(join(dir, "hotspots.json"), JSON.stringify(hotspots, null, 2) + "\n");

for (const [name, spec] of Object.entries(hotspots)) {
  const [hx, hy] = spec.px;
  console.log(`  --cursor-${name}: url("../cursors/${name}.svg") ${hx} ${hy}, ${name};`);
}
console.log(`wrote ${cards.length} cursors → ${dir}`);
