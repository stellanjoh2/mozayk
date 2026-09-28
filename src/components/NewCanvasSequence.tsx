import { useEffect, useMemo, useRef } from "react";
import {
  NEW_CANVAS_SEQUENCE_MS,
  buildBlockCues,
  drawNewCanvasFrame,
  type BlockCue,
} from "../render/newCanvasSequence";
import { resolveCssColor } from "../ui/theme";
import type { GridDimensions, MosaicBlock } from "../types";

type NewCanvasSequenceProps = {
  grid: GridDimensions;
  blocks: MosaicBlock[];
  /** Canvas background colour — the veil hides the mosaic behind it. */
  veilColor: string;
  /** Outgoing mosaic, dissolved behind the sweep. Null on first entry. */
  wipeImage?: HTMLCanvasElement | null;
  displayWidth: number;
  displayHeight: number;
  onDone: () => void;
};

/**
 * Plays the "new canvas" construction over the finished mosaic. Mount it with
 * a `key` that changes per run; it unmounts itself through `onDone`.
 */
export function NewCanvasSequence({
  grid,
  blocks,
  veilColor,
  wipeImage = null,
  displayWidth,
  displayHeight,
  onDone,
}: NewCanvasSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cues = useMemo(
    () => buildBlockCues(blocks, grid),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grid identity churns every render; its numbers do not
    [blocks, grid.columns, grid.rows, grid.width, grid.height],
  );

  // The stage can resize mid-run, so the loop reads the latest geometry.
  const liveRef = useRef<{
    grid: GridDimensions;
    cues: BlockCue[];
    veilColor: string;
    displayWidth: number;
    wipeImage: HTMLCanvasElement | null;
  }>({ grid, cues, veilColor, displayWidth, wipeImage });
  liveRef.current = { grid, cues, veilColor, displayWidth, wipeImage };
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDoneRef.current();
      return;
    }

    const accentColor = resolveCssColor("--chrome");
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const live = liveRef.current;
      const elapsedMs = now - start;
      const nextW = live.grid.width;
      const nextH = live.grid.height;
      // Assigning canvas.width clears the bitmap — only do it when size
      // actually changes, otherwise parent re-renders flash a blank frame.
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;

      drawNewCanvasFrame(canvas, {
        grid: live.grid,
        cues: live.cues,
        elapsedMs,
        veilColor: live.veilColor,
        accentColor,
        wipeImage: live.wipeImage,
        wipeImageWidth: live.wipeImage?.width ?? 0,
        wipeImageHeight: live.wipeImage?.height ?? 0,
        displayScale:
          live.displayWidth > 0 ? live.grid.width / live.displayWidth : 1,
      });

      if (elapsedMs >= NEW_CANVAS_SEQUENCE_MS) {
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
      style={{ width: displayWidth, height: displayHeight }}
    />
  );
}
