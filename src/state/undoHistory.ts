import { MAX_UNDO } from "../config";
import type { Frame, Orientation, OrientationLayout } from "../types";

export type CanvasSnapshot = {
  frames: Frame[];
  activeIndex: number;
  orientation: Orientation;
};

function cloneDerivedLayouts(
  derived: OrientationLayout["derived"],
): OrientationLayout["derived"] {
  if (!derived) return undefined;
  const next: NonNullable<OrientationLayout["derived"]> = {};
  for (const key of Object.keys(derived) as Orientation[]) {
    const blocks = derived[key];
    if (blocks) next[key] = blocks.map((block) => ({ ...block }));
  }
  return next;
}

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
          derived: cloneDerivedLayouts(frame.orientationLayout.derived),
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
