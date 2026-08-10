import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
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

const TIMELINE_GAP = 8;
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

function isNoOpInsert(fromIndex: number, insertIndex: number): boolean {
  return insertIndex === fromIndex || insertIndex === fromIndex + 1;
}

function getItemShift(
  index: number,
  dragIndex: number,
  insertIndex: number,
  slotWidth: number,
): number {
  if (isNoOpInsert(dragIndex, insertIndex)) return 0;
  if (index === dragIndex) return 0;
  if (dragIndex < insertIndex) {
    if (index >= insertIndex) return slotWidth;
  } else if (index >= insertIndex && index < dragIndex) {
    return slotWidth;
  }
  return 0;
}

function getInsertLineX(
  insertIndex: number,
  dragIndex: number | null,
  slotWidth: number,
): number {
  let x = 0;
  for (let i = 0; i < insertIndex; i++) {
    if (i === dragIndex) continue;
    x += slotWidth;
  }
  return x;
}
function getInsertIndex(
  strip: HTMLElement,
  clientX: number,
  dragIndex: number,
  slotWidth: number,
): number {
  const cells = Array.from(
    strip.querySelectorAll<HTMLElement>("[data-timeline-cell]"),
  );

  for (let i = 0; i < cells.length; i++) {
    const rect = cells[i].getBoundingClientRect();
    let left = rect.left;
    let right = rect.right;

    if (i === dragIndex && rect.width < 1) {
      const prev = cells[i - 1]?.getBoundingClientRect();
      const next = cells[i + 1]?.getBoundingClientRect();
      left = prev?.right ?? rect.left;
      right = next?.left ?? left + slotWidth;
    }

    if (clientX < (left + right) / 2) return i;
  }

  return cells.length;
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
  const slotWidth = thumbW + TIMELINE_GAP;

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
        getInsertIndex(strip, event.clientX, pending.index, slotWidth),
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
  }, [onReorder, slotWidth, trackPointer]);

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

  const showInsertLine =
    dragIndex !== null &&
    insertIndex !== null &&
    !isNoOpInsert(dragIndex, insertIndex);

  const insertLineX =
    showInsertLine && insertIndex !== null
      ? getInsertLineX(insertIndex, dragIndex, slotWidth)
      : 0;

  const draggedFrame = dragIndex !== null ? frames[dragIndex] : null;

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
          style={{
            minHeight: thumbH,
            paddingRight: showInsertLine ? slotWidth : 0,
          }}
        >
          {showInsertLine ? (
            <div
              className="timeline-insert-line-host"
              style={{
                height: thumbH,
                transform: `translate3d(${insertLineX}px, 0, 0)`,
              }}
              aria-hidden
            >
              <div className="timeline-insert-line" />
            </div>
          ) : null}
          {frames.map((frame, index) => {
            const shift =
              dragIndex !== null && insertIndex !== null
                ? getItemShift(index, dragIndex, insertIndex, slotWidth)
                : 0;

            return (
              <div
                key={frame.id}
                className="timeline-strip-item"
                style={{ transform: `translate3d(${shift}px, 0, 0)` }}
              >
                <div
                  className={`timeline-thumb-cell${dragIndex === index ? " is-source" : ""}`}
                  data-timeline-cell
                  style={{ width: dragIndex === index ? 0 : thumbW }}
                >
                  <FrameThumbnail
                    frame={frame}
                    orientation={orientation}
                    active={index === activeIndex}
                    hidden={dragIndex === index}
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
