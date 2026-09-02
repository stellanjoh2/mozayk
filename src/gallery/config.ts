import type { GalleryItem, GallerySettings } from "./types";
import { padBackgrounds } from "./types";

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}gallery/${path}`;
}

export const SHOW_SETTINGS: GallerySettings = {
  ratio: "landscape",
  distribution: "ring",
  backgrounds: padBackgrounds(["#64717d", "#647d69", "#7d7664"]),
  distortion: 0.05,
  chromaticAberration: 0.002,
  overscan: 1.75,
  cameraZoom: 0.83,
  focusZoom: 1,
  spinFriction: 0.15,
  cornerRadius: 0.04,
  axisTilt: -5,
  ringTilt: -13,
};

/** Ground floor first. Order matches the staged exhibition. */
export const SHOW_RINGS: GalleryItem[][] = [
  [
    { src: asset("floor1/mozayk-floor1-aliens01.jpg") },
    { src: asset("floor1/mozayk-floor-jp-animated-hd.gif") },
    { src: asset("floor1/nikita.gif") },
    { src: asset("floor1/robocop.jpg") },
    { src: asset("floor1/yoda.jpg") },
    { src: asset("floor1/01.jpg") },
  ],
  [
    { src: asset("floor2/2047.gif") },
    { src: asset("floor2/akira.gif") },
    { src: asset("floor2/t2.jpg") },
    { src: asset("floor2/p2.jpg") },
    { src: asset("floor2/eva.jpg") },
    { src: asset("floor2/mgs2.jpg") },
  ],
  [
    { src: asset("floor3/cowboy-bebop.jpg") },
    { src: asset("floor3/matrix.jpg") },
    { src: asset("floor3/tekken3.jpg") },
    { src: asset("floor3/sw.gif") },
    { src: asset("floor3/jp.gif") },
    { src: asset("floor3/id4.jpg") },
  ],
];
