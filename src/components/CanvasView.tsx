import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { getThumbnailSize } from "../grid/gridMath";
import { ensureCachedSourceImage, drawCoverImage } from "../import/imageSource";
import { renderMosaic } from "../render/renderFrame";
import { getPreviewSize, getPreviewSizeForDisplay } from "../config";
import type { Frame, Orientation } from "../types";

const STAGE_PADDING = 24;

function stageAvailableSize(
  stageWidth: number,
  stageHeight: number,
  stagePadding: number,
): [number, number] {
  return [
    Math.max(0, stageWidth - stagePadding * 2),
    Math.max(0, stageHeight - stagePadding * 2),
  ];
}

function computeFitScale(
  stageWidth: number,
  stageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  stagePadding: number,
): number {
  const [availW, availH] = stageAvailableSize(
    stageWidth,
    stageHeight,
    stagePadding,
  );
  if (availW <= 0 || availH <= 0) return 1;
  return Math.min(availW / canvasWidth, availH / canvasHeight);
}

type CanvasViewProps = {
  frame: Frame;
  orientation: Orientation;
  viewOriginal?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

export function CanvasView({
  frame,
  orientation,
  viewOriginal = false,
  isFullscreen = false,
  onToggleFullscreen,
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);

  const stagePadding = isFullscreen ? 0 : STAGE_PADDING;
  const [availW, availH] = stageAvailableSize(
    stageSize.width,
    stageSize.height,
    stagePadding,
  );
  const [width, height] =
    stageSize.width > 0
      ? getPreviewSizeForDisplay(
          orientation,
          availW,
          availH,
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        )
      : getPreviewSize(orientation);
  const fitScale =
    stageSize.width > 0
      ? computeFitScale(
          stageSize.width,
          stageSize.height,
          width,
          height,
          stagePadding,
        )
      : 1;

  useEffect(() => {
    const needsSource =
      (viewOriginal || frame.settings.showSourceImage) && frame.imageSource;

    if (!needsSource) {
      setSourceImage(null);
      return;
    }

    let cancelled = false;
    void ensureCachedSourceImage(frame.imageSource!.dataUrl)
      .then((image) => {
        if (!cancelled) setSourceImage(image);
      })
      .catch(() => {
        if (!cancelled) setSourceImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    viewOriginal,
    frame.settings.showSourceImage,
    frame.imageSource?.dataUrl,
  ]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (viewOriginal && sourceImage) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawCoverImage(ctx, sourceImage, width, height);
      return;
    }

    renderMosaic(canvas, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width,
      height,
      sourceImage: frame.settings.showSourceImage ? sourceImage : null,
    });
  }, [
    viewOriginal,
    sourceImage,
    frame.settings,
    frame.blocks,
    frame.id,
    frame.imageSource,
    orientation,
    width,
    height,
  ]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateStageSize = () => {
      const next = { width: stage.clientWidth, height: stage.clientHeight };
      setStageSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };

    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Whole CSS pixels — fractional display size interpolates tile edges into hairlines.
  const displayWidth = Math.max(1, Math.round(width * fitScale));
  const displayHeight = Math.max(1, Math.round(height * fitScale));

  return (
    <div
      ref={stageRef}
      className={["canvas-stage", isFullscreen ? "is-fullscreen" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <canvas
        ref={canvasRef}
        className="mosaic-canvas"
        width={width}
        height={height}
        style={{ width: displayWidth, height: displayHeight }}
        aria-label={
          viewOriginal && frame.imageSource
            ? "Original photo preview"
            : "Mosaic preview"
        }
      />
      {onToggleFullscreen || (viewOriginal && frame.imageSource) ? (
        <div className="canvas-stage-controls">
          {onToggleFullscreen ? (
            <button
              type="button"
              className="canvas-fullscreen-toggle"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? "Exit" : "Full"}
            </button>
          ) : null}
          {viewOriginal && frame.imageSource ? (
            <span className="canvas-view-original-badge">Original</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ThumbnailProps = {
  frame: Frame;
  orientation: Orientation;
  active: boolean;
  hidden?: boolean;
  onSelect?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

function FrameThumbnail({
  frame,
  orientation,
  active,
  hidden = false,
  onSelect,
  onPointerDown,
}: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skippedClickRef = useRef(false);
  const [thumbW, thumbH] = getThumbnailSize(orientation);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!frame.settings.showSourceImage || !frame.imageSource) {
      setSourceImage(null);
      return;
    }

    let cancelled = false;
    void ensureCachedSourceImage(frame.imageSource.dataUrl)
      .then((image) => {
        if (!cancelled) setSourceImage(image);
      })
      .catch(() => {
        if (!cancelled) setSourceImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [frame.settings.showSourceImage, frame.imageSource?.dataUrl]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderMosaic(canvas, {
      orientation,
      settings: frame.settings,
      blocks: frame.blocks,
      width: thumbW,
      height: thumbH,
      sourceImage: frame.settings.showSourceImage ? sourceImage : null,
    });
  }, [
    frame.settings,
    frame.blocks,
    frame.id,
    frame.imageSource,
    orientation,
    thumbW,
    thumbH,
    sourceImage,
  ]);

  return (
    <button
      type="button"
      className={[
        "timeline-thumb",
        active ? "is-active" : "",
        hidden ? "is-hidden" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: thumbW, height: thumbH }}
      onClick={() => {
        if (skippedClickRef.current) {
          skippedClickRef.current = false;
          return;
        }
        onSelect?.();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        skippedClickRef.current = false;
        onPointerDown?.(event);
      }}
      aria-label={`Frame preview${active ? ", selected" : ""}`}
    >
      <canvas ref={canvasRef} width={thumbW} height={thumbH} />
    </button>
  );
}

const DRAG_THRESHOLD = 5;

type PendingDrag = {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
};

function insertIndexToTarget(fromIndex: number, insertIndex: number): number {
  if (insertIndex <= fromIndex) return insertIndex;
  return insertIndex - 1;
}

type StripVisualItem =
  | { kind: "insert" }
  | { kind: "frame"; index: number };

function buildVisualStripItems(
  frameCount: number,
  dragIndex: number | null,
  insertIndex: number | null,
): StripVisualItem[] {
  if (dragIndex === null || insertIndex === null) {
    return Array.from({ length: frameCount }, (_, index) => ({
      kind: "frame" as const,
      index,
    }));
  }

  const frameIndices: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    if (i !== dragIndex) frameIndices.push(i);
  }

  let visualInsert = insertIndex;
  if (insertIndex > dragIndex) visualInsert = insertIndex - 1;

  const items: StripVisualItem[] = [];
  for (let vi = 0; vi <= frameIndices.length; vi++) {
    if (vi === visualInsert) items.push({ kind: "insert" });
    if (vi < frameIndices.length) {
      items.push({ kind: "frame", index: frameIndices[vi] });
    }
  }
  return items;
}

function getInsertIndex(strip: HTMLElement, clientX: number): number {
  const slots = Array.from(
    strip.querySelectorAll<HTMLElement>("[data-timeline-slot]"),
  );
  if (slots.length === 0) return 0;

  for (const slot of slots) {
    const rect = slot.getBoundingClientRect();
    const mid = (rect.left + rect.right) / 2;

    if (slot.dataset.insertIndex !== undefined) {
      if (clientX < mid) return Number(slot.dataset.insertIndex);
      continue;
    }

    const frameIndex = Number(slot.dataset.frameIndex);
    if (clientX < mid) return frameIndex;
  }

  const lastSlot = slots[slots.length - 1];
  if (lastSlot.dataset.frameIndex !== undefined) {
    return Number(lastSlot.dataset.frameIndex) + 1;
  }
  return Number(lastSlot.dataset.insertIndex ?? 0) + 1;
}

type TimelineProps = {
  frames: Frame[];
  activeIndex: number;
  orientation: Orientation;
  playing: boolean;
  onSelect: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAdd: () => void;
  onDuplicateCurrent: () => void;
  onRemove: () => void;
  canAddFrame: boolean;
  onTogglePlay: () => void;
};

export function Timeline({
  frames,
  activeIndex,
  orientation,
  playing,
  onSelect,
  onReorder,
  onAdd,
  onDuplicateCurrent,
  onRemove,
  canAddFrame,
  onTogglePlay,
}: TimelineProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const insertIndexRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const [trackPointer, setTrackPointer] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [ghostOffset, setGhostOffset] = useState({ x: 0, y: 0 });
  const [thumbW, thumbH] = getThumbnailSize(orientation);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector(".timeline-thumb.is-active");
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeIndex, frames.length]);

  useLayoutEffect(() => {
    if (!trackPointer) return;

    const updateInsertIndex = (next: number | null) => {
      insertIndexRef.current = next;
      setInsertIndex(next);
    };

    const finishDrag = (commit: boolean) => {
      const pending = pendingDragRef.current;
      pendingDragRef.current = null;
      setTrackPointer(false);

      if (
        commit &&
        pending &&
        draggedRef.current &&
        insertIndexRef.current !== null
      ) {
        const target = insertIndexToTarget(pending.index, insertIndexRef.current);
        if (target !== pending.index) {
          onReorder(pending.index, target);
        }
      }

      draggedRef.current = false;
      setDragIndex(null);
      updateInsertIndex(null);
      setPointer(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;

      const moved = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY,
      );

      if (!draggedRef.current && moved >= DRAG_THRESHOLD) {
        draggedRef.current = true;
        setDragIndex(pending.index);
        updateInsertIndex(pending.index);
        setGhostOffset({ x: pending.offsetX, y: pending.offsetY });
      }

      if (!draggedRef.current) return;

      event.preventDefault();
      setPointer({ x: event.clientX, y: event.clientY });

      const strip = stripRef.current;
      if (!strip) return;
      updateInsertIndex(
        getInsertIndex(strip, event.clientX),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      finishDrag(true);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      finishDrag(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [onReorder, trackPointer]);

  const handleThumbPointerDown = (
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pendingDragRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    draggedRef.current = false;
    setTrackPointer(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const draggedFrame = dragIndex !== null ? frames[dragIndex] : null;
  const visualItems = buildVisualStripItems(
    frames.length,
    dragIndex,
    insertIndex,
  );

  return (
    <footer className="timeline">
      <div className="timeline__controls">
        <button type="button" onClick={onTogglePlay}>
          {playing ? "Stop" : "Play"}
        </button>
        <button type="button" onClick={onRemove} disabled={frames.length <= 1}>
          − Frame
        </button>
        <button type="button" onClick={onDuplicateCurrent} disabled={!canAddFrame}>
          Duplicate Current
        </button>
        <button type="button" onClick={onAdd} disabled={!canAddFrame}>
          + Frame
        </button>
      </div>
      <div ref={stripRef} className="timeline__scroll">
        <div
          className={`timeline__strip${dragIndex !== null ? " is-dragging" : ""}`}
          style={{ minHeight: thumbH }}
        >
          {visualItems.map((item, visualIndex) => {
            if (item.kind === "insert") {
              return (
                <div
                  key={`insert-${visualIndex}`}
                  className="timeline-insert-slot"
                  data-timeline-slot
                  data-insert-index={insertIndex ?? 0}
                  style={{ width: thumbW, height: thumbH }}
                  aria-hidden
                >
                  <div className="timeline-insert-line" />
                </div>
              );
            }

            const { index } = item;
            const frame = frames[index];

            return (
              <div
                key={frame.id}
                className="timeline-strip-item"
                data-timeline-slot
                data-frame-index={index}
              >
                <div
                  className="timeline-thumb-cell"
                  style={{ width: thumbW }}
                >
                  <FrameThumbnail
                    frame={frame}
                    orientation={orientation}
                    active={index === activeIndex}
                    onSelect={() => onSelect(index)}
                    onPointerDown={(event) => handleThumbPointerDown(index, event)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {draggedFrame && pointer && dragIndex !== null
        ? createPortal(
            <div
              className="timeline-drag-ghost"
              style={{
                width: thumbW,
                height: thumbH,
                transform: `translate3d(${pointer.x - ghostOffset.x}px, ${pointer.y - ghostOffset.y}px, 0)`,
              }}
            >
              <FrameThumbnail
                frame={draggedFrame}
                orientation={orientation}
                active={dragIndex === activeIndex}
              />
            </div>,
            document.body,
          )
        : null}
    </footer>
  );
}
