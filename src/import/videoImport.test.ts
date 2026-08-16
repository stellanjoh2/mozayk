import {
  closestGifFrameDelayCs,
  MAX_FRAMES,
  VIDEO_IMPORT_FPS,
} from "../config";
import {
  formatClipDuration,
  orientationFromVideoSize,
  videoFrameCount,
  videoFrameTimestamps,
  videoPlaybackDelayCs,
} from "./videoImport";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(orientationFromVideoSize(1920, 1080) === "landscape", "16:9 is landscape");
  assert(orientationFromVideoSize(1080, 1920) === "portrait", "9:16 is portrait");
  assert(orientationFromVideoSize(1080, 1080) === "square", "1:1 is square");
  assert(orientationFromVideoSize(1200, 1000) === "square", "near-square stays square");
  assert(orientationFromVideoSize(0, 0) === "landscape", "empty size defaults landscape");

  assert(videoFrameCount(0) === 1, "empty clip is one frame");
  assert(videoFrameCount(5, 30, 12) === 30, "5s at 12fps caps at max frames");
  assert(videoFrameCount(1, 30, 12) === 12, "1s at 12fps is 12 frames");
  assert(videoFrameCount(2.5, 30, 12) === 30, "2.5s at 12fps hits the cap");
  assert(videoFrameCount(0.04, 30, 12) === 1, "tiny clip still yields a frame");
  assert(
    videoFrameCount(5, MAX_FRAMES, VIDEO_IMPORT_FPS) === MAX_FRAMES,
    "default helpers use the app cap",
  );

  const stamps = videoFrameTimestamps(5, 5);
  assert(stamps.length === 5, "timestamp count matches frame count");
  assert(stamps[0] === 0, "first timestamp is 0");
  assert(stamps[stamps.length - 1] === 4.999, "last timestamp stays inside duration");
  assert(videoFrameTimestamps(1, 1)[0] === 0, "single frame is t=0");

  const even = videoFrameTimestamps(4, 5);
  assert(
    Math.abs(even[2] - 1.9995) < 1e-9,
    "middle timestamp is halfway to last",
  );

  assert(videoPlaybackDelayCs(5, 30) === 20, "5s / 30 frames snaps to 5fps");
  assert(videoPlaybackDelayCs(1, 12) === 7, "1s / 12 frames snaps to 15fps");
  assert(videoPlaybackDelayCs(5, 25) === 20, "5s / 25 frames is exact 5fps");
  assert(closestGifFrameDelayCs(16) === 20, "16cs is closer to 20 than 10");
  assert(closestGifFrameDelayCs(8) === 7, "8cs is closer to 7 than 10");

  assert(formatClipDuration(5) === "5.0s", "short clips use tenths");
  assert(formatClipDuration(12.4) === "12.4s", "keeps one decimal under a minute");
  assert(formatClipDuration(83) === "1:23", "minute+ clips use m:ss");
  assert(formatClipDuration(-1) === "0s", "invalid duration is 0s");
}

run();
console.log("video import helper tests passed");
