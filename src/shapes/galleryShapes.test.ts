import { galleryShapePlacement, GALLERY_SHAPE_PATHS, GALLERY_SHAPE_VIEWBOX } from "./galleryShapes";
import { assignShape, getShapePool } from "./shapePalette";
import { renderMosaicToSvg } from "../render/renderSvg";
import { createDefaultSettings } from "../state/frameUtils";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  const placed = galleryShapePlacement({ x: 10, y: 20, width: 128, height: 200 });
  assert(placed !== null, "placement exists for a positive rect");
  assert(placed.x === 10, "gallery shape is centred horizontally with floor");
  assert(placed.y === 20 + Math.floor((200 - 128) / 2), "gallery shape is centred vertically");
  assert(
    placed.scale === 128 / GALLERY_SHAPE_VIEWBOX,
    "gallery path scales from the 256 viewBox",
  );

  const empty = galleryShapePlacement({ x: 0, y: 0, width: 0, height: 10 });
  assert(empty === null, "zero-size rect has no gallery placement");

  const defaults = createDefaultSettings();
  assert(
    getShapePool(defaults).length === 1 && getShapePool(defaults)[0] === "block",
    "default palette is blocks only",
  );

  const allOn = {
    ...defaults,
    shapes: {
      block: true,
      sphere: true,
      ring: true,
      triangle: true,
      cross: false,
      clover: true,
      dots: true,
      spots: true,
      arcs: true,
      quads: true,
      checks: true,
      wedges: true,
      ex: true,
      star: true,
      bloom: true,
      flower: true,
      blossom: true,
      moons: true,
      steps: true,
      chevrons: true,
      gates: true,
      waves: true,
      arches: true,
      tiles: true,
      scallops: true,
    },
    shapeMix: 100,
  };
  const pool = getShapePool(allOn);
  assert(pool.includes("clover"), "enabled clovers join the mix");
  assert(pool.includes("dots"), "enabled dots join the mix");
  assert(pool.includes("spots"), "enabled spots join the mix");
  assert(pool.includes("arcs"), "enabled arcs join the mix");
  assert(pool.includes("quads"), "enabled quads join the mix");
  assert(pool.includes("checks"), "enabled checks join the mix");
  assert(pool.includes("wedges"), "enabled wedges join the mix");
  assert(pool.includes("ex"), "enabled xs join the mix");
  assert(pool.includes("star"), "enabled stars join the mix");
  assert(pool.includes("bloom"), "enabled blooms join the mix");
  assert(pool.includes("flower"), "enabled flowers join the mix");
  assert(pool.includes("blossom"), "enabled blossoms join the mix");
  assert(pool.includes("moons"), "enabled moons join the mix");
  assert(pool.includes("steps"), "enabled steps join the mix");
  assert(pool.includes("chevrons"), "enabled chevrons join the mix");
  assert(pool.includes("gates"), "enabled gates join the mix");
  assert(pool.includes("waves"), "enabled waves join the mix");
  assert(pool.includes("arches"), "enabled arches join the mix");
  assert(pool.includes("tiles"), "enabled tiles join the mix");
  assert(pool.includes("scallops"), "enabled scallops join the mix");
  assert(pool.includes("block"), "blocks stay in the pool");
  assert(!pool.includes("cross"), "cross is no longer in the mix");

  const alwaysClover = assignShape(allOn, () => 0);
  assert(alwaysClover !== "block", "mix 100 never returns a block");

  const noBoxes = {
    ...allOn,
    shapes: { ...allOn.shapes, block: false },
  };
  const noBoxPool = getShapePool(noBoxes);
  assert(!noBoxPool.includes("block"), "boxes can leave the pool");
  assert(assignShape(noBoxes, () => 0) !== "block", "mix without boxes never returns a block");

  const paths = Object.values(GALLERY_SHAPE_PATHS);
  assert(new Set(paths).size === paths.length, "gallery path strings are unique");

  const svg = renderMosaicToSvg({
    orientation: "square",
    settings: createDefaultSettings(),
    blocks: [
      { col: 0, row: 0, width: 4, height: 4, shape: "clover", color: "#ff0000" },
      { col: 4, row: 0, width: 4, height: 4, shape: "dots", color: "#00ff00" },
      { col: 8, row: 0, width: 4, height: 4, shape: "spots", color: "#0000ff" },
      { col: 12, row: 0, width: 4, height: 4, shape: "arcs", color: "#ffff00" },
      { col: 16, row: 0, width: 4, height: 4, shape: "quads", color: "#ff00ff" },
      { col: 20, row: 0, width: 4, height: 4, shape: "checks", color: "#00ffff" },
      { col: 24, row: 0, width: 4, height: 4, shape: "wedges", color: "#ffffff" },
      { col: 28, row: 0, width: 4, height: 4, shape: "ex", color: "#111111" },
      { col: 0, row: 4, width: 4, height: 4, shape: "star", color: "#222222" },
      { col: 4, row: 4, width: 4, height: 4, shape: "bloom", color: "#333333" },
      { col: 8, row: 4, width: 4, height: 4, shape: "flower", color: "#444444" },
      { col: 12, row: 4, width: 4, height: 4, shape: "blossom", color: "#555555" },
      { col: 16, row: 4, width: 4, height: 4, shape: "moons", color: "#666666" },
      { col: 20, row: 4, width: 4, height: 4, shape: "steps", color: "#777777" },
      { col: 24, row: 4, width: 4, height: 4, shape: "chevrons", color: "#888888" },
      { col: 28, row: 4, width: 4, height: 4, shape: "gates", color: "#999999" },
      { col: 0, row: 8, width: 4, height: 4, shape: "waves", color: "#aaaaaa" },
      { col: 4, row: 8, width: 4, height: 4, shape: "arches", color: "#bbbbbb" },
      { col: 8, row: 8, width: 4, height: 4, shape: "tiles", color: "#cccccc" },
      { col: 12, row: 8, width: 4, height: 4, shape: "scallops", color: "#dddddd" },
    ],
    width: 256,
    height: 256,
  });
  assert(svg.includes(GALLERY_SHAPE_PATHS.clover), "svg export embeds the clover path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.dots), "svg export embeds the dots path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.spots), "svg export embeds the spots path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.arcs), "svg export embeds the arcs path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.quads), "svg export embeds the quads path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.checks), "svg export embeds the checks path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.wedges), "svg export embeds the wedges path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.ex), "svg export embeds the x path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.star), "svg export embeds the star path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.bloom), "svg export embeds the bloom path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.flower), "svg export embeds the flower path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.blossom), "svg export embeds the blossom path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.moons), "svg export embeds the moons path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.steps), "svg export embeds the steps path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.chevrons), "svg export embeds the chevrons path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.gates), "svg export embeds the gates path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.waves), "svg export embeds the waves path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.arches), "svg export embeds the arches path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.tiles), "svg export embeds the tiles path");
  assert(svg.includes(GALLERY_SHAPE_PATHS.scallops), "svg export embeds the scallops path");
  assert(svg.includes('fill-rule="evenodd"'), "svg export punches gallery holes");
  assert(svg.includes('fill="#ff0000"'), "svg export fills clover with block colour");
}

run();
console.log("gallery shape tests passed");
