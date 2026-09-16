/**
 * Apply the user's settings clipboard and mount a minimal React tree to catch
 * "Maximum update depth exceeded".
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);

// Load via vite-node/tsx-compatible dynamic import of TS sources
const { parseSettingsClipboard } = await import(
  pathToFileURL(path.join(root, "src/state/settingsClipboard.ts")).href
);
const { applyPastedSettings, createDefaultSettings } = await import(
  pathToFileURL(path.join(root, "src/state/frameUtils.ts")).href
);

const raw = fs.readFileSync("/tmp/scene.json", "utf8");
const pasted = parseSettingsClipboard(raw);
if (!pasted) {
  console.error("parse failed");
  process.exit(1);
}

const frame0 = {
  id: "frame-1",
  settings: createDefaultSettings(),
  blocks: [],
};
const next = applyPastedSettings(frame0, pasted, "landscape");
console.log("blocks", next.blocks.length, "density", next.settings.density);
console.log("layoutSource", next.settings.layoutSource);
console.log("saturation", next.settings.saturation);
console.log("ok");
