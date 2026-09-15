import {
  closestGifFrameDelayCs,
  MAX_FRAMES,
  normalizePlaybackFps,
} from "../config";
import {
  formatClipDuration,
  formatClipFps,
  orientationFromVideoSize,
  sourceFrameCount,
  videoFrameTimestamps,
  videoFrameTimestampsAtFps,
  videoImportDurationS,
  videoImportFrameCount,
  videoPlaybackDelayCs,
} from "./videoImport";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(orientationFromVideoSize(1920, 1080) === "landscape", "16:9 is landscape");
  assert(orientationFromVideoSize(1080, 1920) === "portrait", "9:16 is portrait");
  assert(orientationFromVideoSize(1080, 1080) === "square", "1:1 is square");
  assert(orientationFromVideoSize(1080, 1440) === "photo", "3:4 is photo");
  assert(orientationFromVideoSize(1080, 1350) === "photo", "4:5 feed still maps to 3:4");
  assert(orientationFromVideoSize(1200, 1000) === "square", "near-square stays square");
  assert(orientationFromVideoSize(0, 0) === "landscape", "empty size defaults landscape");

  assert(sourceFrameCount(0, 24) === 1, "empty clip is one frame");
  assert(sourceFrameCount(5.2, 24) === 125, "5.2s at 24fps is 125 frames");
  assert(sourceFrameCount(5.7, 24) === 137, "5.7s at 24fps is 137 frames");
  assert(sourceFrameCount(1, 30) === 30, "1s at 30fps is 30 frames");
  assert(sourceFrameCount(0.04, 24) === 1, "tiny clip still yields a frame");

  assert(videoImportFrameCount(5.7, 24) === 137, "short clips import every frame");
  assert(videoImportFrameCount(5.2, 24) === 125, "5.2s imports fully");
  assert(
    videoImportFrameCount(8, 24) === MAX_FRAMES,
    "long clips stop at MAX_FRAMES, not a fixed second mark",
  );
  assert(
    videoImportFrameCount(6.25, 24) === MAX_FRAMES,
    "6.25s at 24fps hits the frame cap",
  );
  assert(
    videoImportDurationS(8, 24) === MAX_FRAMES / 24,
    "truncated import duration follows frames / fps",
  );
  assert(
    Math.abs(videoImportDurationS(5.7, 24) - 5.7) < 1e-9,
    "full imports keep the real clip duration",
  );

  const stamps = videoFrameTimestampsAtFps(5, 24, 5);
  assert(stamps.length === 5, "timestamp count matches frame count");
  assert(stamps[0] === 0, "first timestamp is 0");
  assert(Math.abs(stamps[1] - 1 / 24) < 1e-9, "second frame is 1/fps");
  assert(stamps[stamps.length - 1] <= 5 - 0.001, "last timestamp stays inside duration");
  assert(videoFrameTimestampsAtFps(1, 24, 1)[0] === 0, "single frame is t=0");

  const legacy = videoFrameTimestamps(5, 5);
  assert(legacy[0] === 0, "legacy first timestamp is 0");
  assert(legacy[legacy.length - 1] === 4.999, "legacy last timestamp stays inside duration");

  assert(videoPlaybackDelayCs(5, 30) === 20, "5s / 30 frames snaps to 5fps");
  assert(videoPlaybackDelayCs(1, 12) === 7, "1s / 12 frames snaps to 15fps");
  assert(videoPlaybackDelayCs(5, 25) === 20, "5s / 25 frames is exact 5fps");
  assert(closestGifFrameDelayCs(16) === 20, "16cs is closer to 20 than 10");
  assert(closestGifFrameDelayCs(8) === 7, "8cs is closer to 7 than 10");
  assert(normalizePlaybackFps(23.976) === 24, "23.976 snaps to 24 playback");
  assert(normalizePlaybackFps(29.97) === 30, "29.97 snaps to 30 playback");

  assert(formatClipDuration(5) === "5.0s", "short clips use tenths");
  assert(formatClipDuration(12.4) === "12.4s", "keeps one decimal under a minute");
  assert(formatClipDuration(83) === "1:23", "minute+ clips use m:ss");
  assert(formatClipDuration(-1) === "0s", "invalid duration is 0s");
  assert(formatClipFps(24) === "24 fps", "integer fps stays clean");
  assert(formatClipFps(23.976) === "24 fps", "near-integer fps snaps for display");
  assert(formatClipFps(12.5) === "12.50 fps", "half fps keeps decimals");
}

run();
console.log("video import helper tests passed");
