import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  IMAGE_FILL_SEQUENCE_MS,
  buildRadialFillBlockCues,
  drawImageFillFrame,
  type BlockCue,
} from "../render/newCanvasSequence";
import { pauseFrost } from "../ui/frostPause";
import { playUiSound } from "../ui/sounds";
import type { GridDimensions, MosaicBlock } from "../types";

type ImageFillSequenceProps = {
  grid: GridDimensions;
  blocks: MosaicBlock[];
  /** Mosaic pixels from before the import landed. */
  coverImage: HTMLCanvasElement;
  displayWidth: number;
  displayHeight: number;
  onDone: () => void;
};

/**
 * Plays the image-import fill wave over the finished mosaic. Mount with a
 * `key` that changes per run; it unmounts itself through `onDone`.
 */
export function ImageFillSequence({
  grid,
  blocks,
  coverImage,
  displayWidth,
  displayHeight,
  onDone,
}: ImageFillSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cues = useMemo(
    () => buildRadialFillBlockCues(blocks, grid),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grid identity churns every render; its numbers do not
    [blocks, grid.columns, grid.rows, grid.width, grid.height],
  );

  const liveRef = useRef<{
    grid: GridDimensions;
    cues: BlockCue[];
    coverImage: HTMLCanvasElement;
  }>({ grid, cues, coverImage });
  liveRef.current = { grid, cues, coverImage };
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => pauseFrost(), []);

  // Layout — cover must be on the bitmap before the browser paints, otherwise
  // the imported mosaic underneath flashes for one frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDoneRef.current();
      return;
    }

    playUiSound("imageFill");

    const start = performance.now();

    const paint = (elapsedMs: number) => {
      const live = liveRef.current;
      const nextW = live.grid.width;
      const nextH = live.grid.height;
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;

      drawImageFillFrame(canvas, {
        grid: live.grid,
        cues: live.cues,
        elapsedMs,
        coverImage: live.coverImage,
        coverImageWidth: live.coverImage.width,
        coverImageHeight: live.coverImage.height,
      });
    };

    paint(0);

    let raf = requestAnimationFrame(function tick(now: number) {
      const elapsedMs = now - start;
      paint(elapsedMs);

      if (elapsedMs >= IMAGE_FILL_SEQUENCE_MS) {
        onDoneRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="mosaic-new-canvas"
      aria-hidden="true"
      width={grid.width}
      height={grid.height}
      style={{ width: displayWidth, height: displayHeight }}
    />
  );
}
