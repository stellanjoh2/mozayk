# About Mozayk

**Mozayk** is a browser-based mosaic generator for creating abstract grid compositions, animated sequences, and image-driven layouts. It runs in the browser — no install, no account. Your mosaics and files stay on your device.

**Live app:** [mozayk.design](https://mozayk.design/)  
**Source:** [github.com/stellanjoh2/mozayk](https://github.com/stellanjoh2/mozayk)

Created by [Stellan Johansson](https://github.com/stellanjoh2).

---

## What it does

Mozayk fills a canvas with a grid of coloured shapes — blocks, spheres, rings, triangles, crosses, and optional gallery or custom marks — then gives you deep control over how that grid is built, styled, and exported.

You can work in two modes:

- **Procedural** — generate random layouts from sliders and colour palettes.
- **Imported** — upload a photo or short video clip and map its colours and structure onto the mosaic grid.

Either way, the result is a precise, resolution-aware composition you can export as stills or animation.

---

## Features

### Layout & shapes

- Landscape (16:9), portrait (9:16), square (1:1), and photo (3:4) orientations
- Adjustable grid density, fill, weight, and size contrast
- Core shape mix: blocks, spheres, rings, triangles, crosses
- Gallery shapes from [shapes.gallery](https://www.shapes.gallery/) (clovers, stars, waves, and more)
- Up to 8 custom image shapes (SVG / PNG / JPEG / WebP / BMP)
- Random height/width variation, corner radius, and shape gap
- Wireframe peel — outline a share of blocks from the inside out, with stroke width

### Colour

- Up to 8 colours with per-slot locking and amount weighting
- Randomize current palette or roll an entirely new one
- Hue shift, saturation, contrast, brightness, and invert
- Copy/paste settings between frames

### Overlays & effects

- Grid overlay and crosses with independent density, colour, stroke, opacity, blend mode, and chaos
- Grid blur with adjustable amount and randomness
- Film grain, texture overlay, and optional background photo
- Data fields — sparse monospace coordinate labels
- Reveal imported source image in gaps between shapes

### Timeline

- Up to 30 frames per project
- Reorder, duplicate, and scrub through a live preview
- Per-frame settings with shared canvas orientation
- Apply a look from one frame to all others

### Import

- **Images** — JPEG, PNG, WebP, GIF, AVIF, BMP
- **Video** — MP4 or MOV, up to 150 frames at the clip’s native frame rate
- Still imports pick the closest canvas ratio (16:9 / 9:16 / 1:1 / 3:4)

Imported layouts can be reshuffled while keeping their source colours.

### Export

- **PNG** — current frame, transparent background, or full sequence as ZIP
- **JPG** — current frame or full sequence as ZIP (same resolution presets as PNG)
- **SVG** — vector frame export
- **GIF** — animated export at 480p or 720p
- **MP4** — H.264 video via WebCodecs (1080p–2160p)

Resolution presets: 1080p, 1440p, 2160p (PNG / JPG / MP4).

### Project files

Save and load `.mzk` project files to preserve frames, settings, orientation, and export preferences.

### Related pages

Linked from the app chrome:

- **[Logo creator](https://stellanjoh2.github.io/mozayk/logo.html)** — interactive Mozayk mark editor (SVG / PNG / MOV export)
- **[Gallery](https://stellanjoh2.github.io/mozayk/gallery.html)** — 3D ring gallery for browsing media

### Other

- Undo history (10 steps)
- Fullscreen mode
- UI sounds (toggleable)
- Desktop-first — portrait mobile shows a gate screen

---

## How it works

Mozayk is a single-page React app. The mosaic is rendered on HTML Canvas in real time; exports re-render at the chosen resolution offline in the browser.

Image and video import samples source pixels into a palette, then assigns colours and shapes to grid cells. Procedural mode uses seeded randomness with constraints so layouts stay on-grid and visually balanced.

Animation export encodes the timeline frame by frame — GIF via [gifski-wasm](https://www.npmjs.com/package/gifski-wasm), MP4 via [mediabunny](https://github.com/Vanilagy/mediabunny) and the browser's WebCodecs API.

---

## Tech stack

- **React 19** + **TypeScript**
- **Vite** for dev and build
- **GSAP** for timeline and panel animations
- **Canvas 2D** for mosaic rendering; **Three.js** for the gallery page
- Deployed to **GitHub Pages** on push to `main`

Third-party libraries, UI attributions, and license notes are listed in [CREDITS.md](./CREDITS.md).

---

## Local development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

---

## License

Mozayk source is all rights reserved; third-party libraries have their own licenses — see [CREDITS.md](./CREDITS.md) for details.
