# Credits

Mozayk uses open-source software, browser platform APIs, and adapted UI patterns.

## Libraries

| Name | Used for | License |
| --- | --- | --- |
| [React](https://react.dev/) | UI framework | MIT |
| [React DOM](https://react.dev/) | Rendering | MIT |
| [GSAP](https://gsap.com/) | Timeline and thumbnail animations; Flip plugin for frame reordering | [GSAP Standard License](https://gsap.com/standard-license) |
| [@gsap/react](https://gsap.com/docs/v3/Plugins/React/) | `useGSAP` hook for React lifecycle-safe animations | GSAP Standard License |
| [fflate](https://github.com/101arrowz/fflate) | ZIP bundling for multi-frame PNG export | MIT |
| [gifski-wasm](https://www.npmjs.com/package/gifski-wasm) / [gifski](https://gif.ski/) | GIF encoding | AGPL-3.0-or-later |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | MP4 export via WebCodecs (H.264) | MPL-2.0 |
| [SUSE Mono](https://fontsource.org/fonts/suse-mono) via [@fontsource-variable/suse-mono](https://www.npmjs.com/package/@fontsource-variable/suse-mono) | UI typography | OFL-1.1 |

## Build tools

| Name | Used for | License |
| --- | --- | --- |
| [Vite](https://vite.dev/) | Dev server and production build | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | React support in Vite | MIT |
| [TypeScript](https://www.typescriptlang.org/) | Type checking | Apache-2.0 |
| [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) | Linting | MIT |

The project also started from the standard [React + TypeScript + Vite](https://vite.dev/guide/) template.

## UI patterns

| Source | Used for | License / note |
| --- | --- | --- |
| [nikk7007 / smooth-fox-6](https://uiverse.io/nikk7007/smooth-fox-6) on Uiverse | Toggle switch CSS (`.ui-switch`), adapted and restyled | MIT |
| rfrct | Color picker UI and logic, ported with monochrome styling | Author's prior work |

Attribution comments in source:

- `src/App.css` — switch adapted from nikk7007/smooth-fox-6
- `src/App.css` — color picker ported from rfrct

## Browser platform APIs

These are built into supported browsers rather than npm packages:

- **WebCodecs** — H.264 MP4 encoding (via mediabunny)
- **EyeDropper API** — screen color picking
- **Web Audio API** — UI sound playback
- **ResizeObserver** — canvas and stage sizing

## Project assets

The following appear to be project-owned and have no external attribution in the repository:

- Logo SVGs (`src/assets/mozayk_logo.svg`, `public/mosaik_logo2.svg`)
- Icon sprite (`public/icons.svg`)
- UI sound files (`public/sounds/*.wav`)

## License notes

- **gifski-wasm** is licensed under **AGPL-3.0-or-later**. Review compliance before distributing the app.
- **GSAP** uses its own standard license. See [gsap.com/standard-license](https://gsap.com/standard-license) for commercial and redistribution terms.
