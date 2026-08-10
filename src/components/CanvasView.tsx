import { useEffect, useLayoutEffect, useRef } from "react";
import { getThumbnailSize } from "../grid/gridMath";
import { renderMosaic } from "../render/renderFrame";
import {
  PREVIEW_HEIGHT_LANDSCAPE,
  PREVIEW_WIDTH_LANDSCAPE,
} from "../config";
import type { Frame, Orientation } from "../types";

type CanvasViewProps = {
  frame: Frame;
  orientation: Orientation;
};

export function CanvasView({ frame, orientation }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width =
    orientation === "landscape"
      ? PREVIEW_WIDTH_LANDSCAPE
      : PREVIEW_HEIGHT_LANDSCAPE;
  const height =
    orientation === "landscape"
      ? PREVIEW_HEIGHT_LANDSCAPE
      : PREVIEW_WIDTH_LANDSCAPE;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderMosaic(canvas, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width,
      height,
    });
  }, [frame.settings, frame.blocks, frame.id, orientation, width, height]);

  return (
    <div className="canvas-stage">
      <canvas
        ref={canvasRef}
        className="mosaic-canvas"
        width={width}
        height={height}
        aria-label="Mosaic preview"
      />
    </div>
  );
}

type ThumbnailProps = {
  frame: Frame;
  orientation: Orientation;
  active: boolean;
  onSelect: () => void;
};

function FrameThumbnail({
  frame,
  orientation,
  active,
  onSelect,
}: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbW, thumbH] = getThumbnailSize(orientation, frame.settings.density);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderMosaic(canvas, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width: thumbW,
      height: thumbH,
    });
  }, [frame.settings, frame.blocks, frame.id, orientation, thumbW, thumbH]);

  return (
    <button
      type="button"
      className={`timeline-thumb${active ? " is-active" : ""}`}
      onClick={onSelect}
      aria-label="Select frame"
    >
      <canvas ref={canvasRef} width={thumbW} height={thumbH} />
    </button>
  );
}

type TimelineProps = {
  frames: Frame[];
  activeIndex: number;
  orientation: Orientation;
  playing: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: () => void;
  onTogglePlay: () => void;
};

export function Timeline({
  frames,
  activeIndex,
  orientation,
  playing,
  onSelect,
  onAdd,
  onRemove,
  onTogglePlay,
}: TimelineProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector(".timeline-thumb.is-active");
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeIndex, frames.length]);

  return (
    <footer className="timeline">
      <div className="timeline__controls">
        <button type="button" onClick={onTogglePlay}>
          {playing ? "Stop" : "Play"}
        </button>
        <button type="button" onClick={onRemove} disabled={frames.length <= 1}>
          − Frame
        </button>
        <button type="button" onClick={onAdd}>
          + Frame
        </button>
      </div>
      <div ref={stripRef} className="timeline__strip">
        {frames.map((frame, index) => (
          <FrameThumbnail
            key={frame.id}
            frame={frame}
            orientation={orientation}
            active={index === activeIndex}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </footer>
  );
}
