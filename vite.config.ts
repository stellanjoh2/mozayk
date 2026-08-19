import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/mozayk/" : "/",
  // LightningCSS minify rewrites `backdrop-filter` to `-webkit-backdrop-filter`
  // only. Chrome ignores the prefixed property, so frost works in `vite dev`
  // (unminified) and dies on GitHub Pages.
  build: {
    cssMinify: false,
  },
  optimizeDeps: {
    exclude: ["gifski-wasm"],
  },
});
