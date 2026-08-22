import { createDefaultSettings } from "../state/frameUtils";
import {
  defaultMzkFileName,
  isMzkFile,
  parseMzkProject,
  serializeMzkProject,
  type MzkProject,
} from "./mzkFormat";
import type { Frame } from "../types";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sampleFrame(id: string): Frame {
  return {
    id,
    settings: {
      ...createDefaultSettings(),
      fillAmount: 77,
      colors: ["#ff3355", "#22cc88"],
      colorAmounts: [60, 40],
    },
    blocks: [
      { col: 0, row: 0, width: 4, height: 2, shape: "block", color: "#ff3355" },
      { col: 4, row: 0, width: 2, height: 2, shape: "ring", color: "#22cc88" },
    ],
    imageSource: {
      dataUrl: "data:image/png;base64,abc",
      palette: ["#ff3355"],
      paletteRgb: [{ r: 255, g: 51, b: 85 }],
    },
    textureOverlay: { dataUrl: "data:image/png;base64,tex" },
    backgroundImage: { dataUrl: "data:image/png;base64,bg", name: "bg.png" },
  };
}

function sampleProject(): MzkProject {
  return {
    orientation: "portrait",
    frames: [sampleFrame("a"), sampleFrame("b")],
    activeIndex: 1,
    exportPreset: "1440p",
    mp4Preset: "2160p",
    gifPreset: "720p",
    gifFrameDelayCs: 5,
    playbackFps: 24,
  };
}

function run(): void {
  const project = sampleProject();
  const json = serializeMzkProject(project);
  const parsed = parseMzkProject(json);

  assert(parsed !== null, "serialized project should parse");
  assert(
    parsed.orientation === "portrait",
    "orientation survives round-trip",
  );
  assert(parsed.frames.length === 2, "frame count survives round-trip");
  assert(parsed.activeIndex === 1, "active index survives round-trip");
  assert(parsed.exportPreset === "1440p", "export preset survives round-trip");
  assert(parsed.mp4Preset === "1080p", "portrait mp4 preset is clamped to 1080p");
  assert(parsed.gifPreset === "720p", "gif preset survives round-trip");
  assert(parsed.gifFrameDelayCs === 5, "gif delay survives round-trip");
  assert(parsed.playbackFps === 24, "playback fps survives round-trip");
  assert(parsed.frames[0].blocks.length === 2, "blocks survive round-trip");
  assert(
    parsed.frames[0].imageSource?.dataUrl === "data:image/png;base64,abc",
    "image source survives round-trip",
  );
  assert(
    parsed.frames[0].textureOverlay?.dataUrl === "data:image/png;base64,tex",
    "texture overlay survives round-trip",
  );
  assert(
    parsed.frames[0].backgroundImage?.name === "bg.png",
    "background image survives round-trip",
  );

  assert(
    parseMzkProject('{"v":1,"mozayk":"settings"}') === null,
    "settings clipboard payload is rejected",
  );
  assert(
    parseMzkProject('{"v":2,"mozayk":"project","orientation":"landscape","frames":[]}') ===
      null,
    "empty frames are rejected",
  );

  const emptyBlocksJson = serializeMzkProject({
    orientation: "landscape",
    frames: [
      {
        id: "empty-blocks",
        settings: createDefaultSettings(),
        blocks: [],
        imageSource: {
          dataUrl: "data:image/png;base64,abc",
          palette: ["#ffffff"],
          paletteRgb: [{ r: 255, g: 255, b: 255 }],
        },
      },
    ],
    activeIndex: 0,
    exportPreset: "1080p",
    mp4Preset: "1080p",
    gifPreset: "480p",
    gifFrameDelayCs: 7,
    playbackFps: 15,
  });
  const emptyBlocksParsed = parseMzkProject(emptyBlocksJson);
  assert(emptyBlocksParsed !== null, "frames with empty blocks should parse");
  assert(
    emptyBlocksParsed?.frames[0].blocks.length === 0,
    "empty block arrays survive round-trip",
  );

  assert(isMzkFile(new File(["{}"], "scene.mzk")), ".mzk extension is accepted");
  assert(!isMzkFile(new File(["{}"], "scene.json")), ".json extension is rejected");
  assert(defaultMzkFileName() === "mozayk.mzk", "default filename uses .mzk");

  const legacyJson = JSON.stringify({
    v: 1,
    mozayk: "project",
    orientation: "portrait",
    frames: sampleProject().frames,
    activeIndex: 1,
    exportPreset: "1440p",
    gifPreset: "720p",
    gifFrameDelayCs: 7,
  });
  const legacyDensityJson = JSON.stringify({
    v: 1,
    mozayk: "project",
    orientation: "landscape",
    frames: [
      {
        id: "legacy-density",
        settings: {
          ...createDefaultSettings(),
          density: 1,
          gridOverlayDensity: 5,
        },
        blocks: [
          { col: 0, row: 0, width: 4, height: 9, shape: "block", color: "#ffffff" },
        ],
      },
    ],
    activeIndex: 0,
  });
  const legacyDensity = parseMzkProject(legacyDensityJson);
  assert(legacyDensity !== null, "v1 project with density 1 should parse");
  assert(
    legacyDensity?.frames[0].settings.density === 1,
    "v1 density 1 stays 16×9",
  );
  assert(
    legacyDensity?.frames[0].settings.gridOverlayDensity === 5,
    "v1 overlay density 5 stays 5",
  );

  const v2DensityJson = JSON.stringify({
    v: 2,
    mozayk: "project",
    orientation: "landscape",
    frames: [
      {
        id: "v2-density",
        settings: {
          ...createDefaultSettings(),
          density: 3,
          gridOverlayDensity: 6,
        },
        blocks: [
          { col: 0, row: 0, width: 4, height: 9, shape: "block", color: "#ffffff" },
        ],
      },
    ],
    activeIndex: 0,
  });
  const v2Density = parseMzkProject(v2DensityJson);
  assert(v2Density !== null, "v2 project should parse");
  assert(
    v2Density?.frames[0].settings.density === 2,
    "v2 density 3 migrates back to 2",
  );
  assert(
    v2Density?.frames[0].settings.gridOverlayDensity === 5,
    "v2 overlay density 6 migrates to 5",
  );

  const legacyParsed = parseMzkProject(legacyJson);
  assert(legacyParsed !== null, "legacy project without playbackFps should parse");
  assert(
    legacyParsed?.playbackFps === 15,
    "legacy playback fps is derived from gif delay",
  );
  assert(
    legacyParsed?.mp4Preset === "1080p",
    "legacy portrait mp4 preset is clamped to 1080p",
  );

  const photoJson = serializeMzkProject({
    ...sampleProject(),
    orientation: "photo",
    mp4Preset: "1440p",
  });
  const photoParsed = parseMzkProject(photoJson);
  assert(photoParsed?.orientation === "photo", "3:4 orientation survives round-trip");
  assert(photoParsed?.mp4Preset === "1440p", "3:4 mp4 preset is not clamped to 1080p");

  console.log("mzkFormat.test.ts: all passed");
}

run();
