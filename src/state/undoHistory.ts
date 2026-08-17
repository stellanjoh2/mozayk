import { MAX_UNDO } from "../config";
import type { Frame, Orientation } from "../types";

export type CanvasSnapshot = {
  frames: Frame[];
  activeIndex: number;
  orientation: Orientation;
};

/** Clone editable canvas data; reuse imageSource / textureOverlay / backgroundImage refs (dataUrls are large). */
export function cloneFrameForHistory(frame: Frame): Frame {
  return {
    id: frame.id,
    settings: structuredClone(frame.settings),
    blocks: frame.blocks.map((block) => ({ ...block })),
    imageSource: frame.imageSource,
    textureOverlay: frame.textureOverlay,
    backgroundImage: frame.backgroundImage,
    orientationLayout: frame.orientationLayout
      ? {
          orientation: frame.orientationLayout.orientation,
          blocks: frame.orientationLayout.blocks.map((block) => ({ ...block })),
          colors: [...frame.orientationLayout.colors],
          derived: frame.orientationLayout.derived
            ? {
                landscape: frame.orientationLayout.derived.landscape?.map(
                  (block) => ({ ...block }),
                ),
                portrait: frame.orientationLayout.derived.portrait?.map(
                  (block) => ({ ...block }),
                ),
                square: frame.orientationLayout.derived.square?.map((block) => ({
                  ...block,
                })),
              }
            : undefined,
        }
      : undefined,
  };
}

export function captureCanvasSnapshot(
  frames: Frame[],
  activeIndex: number,
  orientation: Orientation,
): CanvasSnapshot {
  return {
    frames: frames.map(cloneFrameForHistory),
    activeIndex,
    orientation,
  };
}

export function pushSnapshot(
  stack: CanvasSnapshot[],
  snapshot: CanvasSnapshot,
  max = MAX_UNDO,
): CanvasSnapshot[] {
  return [...stack, snapshot].slice(-max);
}
