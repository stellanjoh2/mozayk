import { readdirSync, readFileSync } from "node:fs";

const css = readdirSync("dist/assets")
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(`dist/assets/${name}`, "utf8"))
  .join("\n");

const webkit = (css.match(/-webkit-backdrop-filter:/g) ?? []).length;
const total = (css.match(/backdrop-filter:/g) ?? []).length;
const unprefixed = total - webkit;

if (unprefixed < 1) {
  console.error(
    "Production CSS dropped unprefixed backdrop-filter (Chrome needs it). Do not re-enable LightningCSS CSS minify.",
  );
  process.exit(1);
}

console.log(`frost css ok (${unprefixed} unprefixed, ${webkit} -webkit)`);
