import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/mozayk/" : "/",
  // LightningCSS minify rewrites `backdrop-filter` to `-webkit-backdrop-filter`
  // only. Chrome ignores the prefixed property, so frost works in `vite dev`
  // (unminified) and dies on GitHub Pages.
  build: {
    cssMinify: false,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        logo: resolve(root, "logo.html"),
        gallery: resolve(root, "gallery.html"),
        stats: resolve(root, "stats/index.html"),
      },
    },
  },
  optimizeDeps: {
    exclude: ["gifski-wasm"],
  },
  worker: {
    format: "es",
  },
});
