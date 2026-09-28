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
  }>({ grid, cues, veilColor, displayWidth });
  liveRef.current = { grid, cues, veilColor, displayWidth };
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

      if (canvas.width !== live.grid.width) canvas.width = live.grid.width;
      if (canvas.height !== live.grid.height) canvas.height = live.grid.height;

      drawNewCanvasFrame(canvas, {
        grid: live.grid,
        cues: live.cues,
        elapsedMs,
        veilColor: live.veilColor,
        accentColor,
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
      width={grid.width}
      height={grid.height}
      style={{ width: displayWidth, height: displayHeight }}
    />
  );
}
