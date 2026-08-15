import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(useGSAP, Flip);
import { getThumbnailRenderSize, getThumbnailSize } from "../grid/gridMath";
import {
  drawCoverImage,
  ensureCachedSourceImage,
  getCachedSourceImage,
} from "../import/imageSource";
import { renderMosaic } from "../render/renderFrame";
import { getPreviewSize, getPreviewSizeForDisplay } from "../config";
import type { Frame, Orientation } from "../types";
import { playUiSound } from "../ui/sounds";

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
  isInspecting?: boolean;
  onToggleFullscreen?: () => void;
  onToggleInspect?: () => void;
};

export function CanvasView({
  frame,
  orientation,
  viewOriginal = false,
  isFullscreen = false,
  isInspecting = false,
  onToggleFullscreen,
  onToggleInspect,
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [textureOverlayImage, setTextureOverlayImage] =
    useState<HTMLImageElement | null>(null);

  const stagePadding = isFullscreen ? 0 : STAGE_PADDING;
  const [availW, availH] = stageAvailableSize(
    stageSize.width,
    stageSize.height,
    stagePadding,
  );
  const nativeSize = getPreviewSize(orientation);
  const [width, height] = isInspecting
    ? nativeSize
    : stageSize.width > 0
      ? getPreviewSizeForDisplay(
          orientation,
          availW,
          availH,
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        )
      : nativeSize;
  const fitScale =
    isInspecting || stageSize.width <= 0
      ? 1
      : computeFitScale(
          stageSize.width,
          stageSize.height,
          width,
          height,
          stagePadding,
        );

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

  useEffect(() => {
    if (!frame.textureOverlay) {
      setTextureOverlayImage(null);
      return;
    }

    let cancelled = false;
    void ensureCachedSourceImage(frame.textureOverlay.dataUrl)
      .then((image) => {
        if (!cancelled) setTextureOverlayImage(image);
      })
      .catch(() => {
        if (!cancelled) setTextureOverlayImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [frame.textureOverlay?.dataUrl]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (viewOriginal && sourceImage) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawCoverImage(ctx, sourceImage, width, height);
      return;
    }

    try {
      renderMosaic(canvas, {
        orientation,
        settings: frame.settings,
        blocks: frame.blocks,
        width,
        height,
        sourceImage: frame.settings.showSourceImage ? sourceImage : null,
        textureOverlayImage,
      });
    } catch (error) {
      console.error(error);
    }
  }, [
    viewOriginal,
    sourceImage,
    textureOverlayImage,
    frame.settings,
    frame.blocks,
    frame.id,
    frame.imageSource,
    frame.textureOverlay,
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

  // Whole CSS pixels, aspect locked — independent W/H rounding skews scale and
  // resurrects 0.5px hairlines between tiles under CSS interpolation.
  const displayWidth = isInspecting
    ? nativeSize[0]
    : Math.max(1, Math.round(width * fitScale));
  const displayHeight = isInspecting
    ? nativeSize[1]
    : Math.max(1, Math.round(displayWidth * (height / width)));

  return (
    <div
      ref={stageRef}
      className={[
        "canvas-stage",
        isFullscreen ? "is-fullscreen" : "",
        isInspecting ? "is-inspecting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="canvas-stage__frame">
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
      </div>
      {onToggleFullscreen ||
      onToggleInspect ||
      (viewOriginal && frame.imageSource) ? (
        <div className="canvas-stage-controls">
          {onToggleInspect && isInspecting ? (
            <button
              type="button"
              className="canvas-fullscreen-toggle"
              onClick={onToggleInspect}
              aria-label="Exit 100% inspect"
              aria-pressed
            >
              100%
            </button>
          ) : null}
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
  const [renderW, renderH] = getThumbnailRenderSize(orientation);
  const overlayDataUrl = frame.textureOverlay?.dataUrl;
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [textureOverlayImage, setTextureOverlayImage] =
    useState<HTMLImageElement | null>(() =>
      overlayDataUrl ? getCachedSourceImage(overlayDataUrl) ?? null : null,
    );

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

  useEffect(() => {
    if (!overlayDataUrl) {
      setTextureOverlayImage(null);
      return;
    }

    const cached = getCachedSourceImage(overlayDataUrl);
    if (cached) {
      setTextureOverlayImage(cached);
      return;
    }

    let cancelled = false;
    void ensureCachedSourceImage(overlayDataUrl)
      .then((image) => {
        if (!cancelled) setTextureOverlayImage(image);
      })
      .catch(() => {
        if (!cancelled) setTextureOverlayImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [overlayDataUrl]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      renderMosaic(canvas, {
        orientation,
        settings: frame.settings,
        blocks: frame.blocks,
        width: renderW,
        height: renderH,
        sourceImage: frame.settings.showSourceImage ? sourceImage : null,
        textureOverlayImage,
      });
    } catch (error) {
      console.error(error);
    }
  }, [
    frame.settings,
    frame.blocks,
    frame.id,
    frame.imageSource,
    frame.textureOverlay,
    orientation,
    renderW,
    renderH,
    sourceImage,
    textureOverlayImage,
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
      <canvas ref={canvasRef} width={renderW} height={renderH} />
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
  const pendingFlipRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const pendingAddRef = useRef(false);
  const addingRef = useRef(false);
  const removeTlRef = useRef<gsap.core.Timeline | null>(null);
  const [trackPointer, setTrackPointer] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [ghostOffset, setGhostOffset] = useState({ x: 0, y: 0 });
  const [removing, setRemoving] = useState(false);
  const [thumbW, thumbH] = getThumbnailSize(orientation);

  useGSAP(() => {
    return () => {
      removeTlRef.current?.kill();
      pendingFlipRef.current = null;
    };
  }, { scope: stripRef });

  useEffect(() => {
    if (removing || addingRef.current) return;
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector(".timeline-thumb.is-active");
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeIndex, frames.length, removing]);

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

  useLayoutEffect(() => {
    const state = pendingFlipRef.current;
    const isAdd = pendingAddRef.current;
    pendingFlipRef.current = null;
    pendingAddRef.current = false;

    const newThumb = isAdd
      ? (stripRef.current?.querySelector(
          ".timeline-thumb.is-active",
        ) as HTMLElement | null)
      : null;

    let flashTimer = 0;
    const flashNew = () => {
      if (!newThumb) return;
      gsap.set(newThumb, { autoAlpha: 1, clearProps: "opacity,visibility" });
      newThumb.classList.add("is-adding");
      newThumb.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
      flashTimer = window.setTimeout(() => {
        newThumb.classList.remove("is-adding");
        addingRef.current = false;
      }, 250);
    };

    if (newThumb) {
      addingRef.current = true;
      gsap.set(newThumb, { autoAlpha: 0 });
    }

    if (!state) {
      flashNew();
      return () => {
        window.clearTimeout(flashTimer);
        if (newThumb) {
          gsap.set(newThumb, { autoAlpha: 1, clearProps: "opacity,visibility" });
          newThumb.classList.remove("is-adding");
        }
        addingRef.current = false;
      };
    }

    const tween = Flip.from(state, {
      duration: 0.35,
      ease: "power2.inOut",
      absolute: true,
      scale: false,
      simple: true,
      onEnter: (elements) => {
        const thumbs = gsap.utils
          .toArray<Element>(elements)
          .flatMap((el) => [...el.querySelectorAll(".timeline-thumb")]);
        if (thumbs.length) gsap.set(thumbs, { autoAlpha: 0 });
      },
      onComplete: () => {
        setRemoving(false);
        flashNew();
      },
    });
    return () => {
      tween.kill();
      window.clearTimeout(flashTimer);
      setRemoving(false);
      if (newThumb) {
        gsap.set(newThumb, { autoAlpha: 1, clearProps: "opacity,visibility" });
        newThumb.classList.remove("is-adding");
      }
      addingRef.current = false;
    };
  }, [frames]);

  const captureStripThen = (action: () => void) => {
    const strip = stripRef.current;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    playUiSound("ok");
    addingRef.current = true;
    pendingAddRef.current = true;
    if (strip && !reduceMotion) {
      pendingFlipRef.current = Flip.getState(
        strip.querySelectorAll(".timeline-strip-item"),
      );
    }
    action();
  };

  const handleAddClick = () => {
    if (removing || !canAddFrame || dragIndex !== null) return;
    captureStripThen(onAdd);
  };

  const handleDuplicateClick = () => {
    if (removing || !canAddFrame || dragIndex !== null) return;
    captureStripThen(onDuplicateCurrent);
  };

  const handleRemoveClick = () => {
    if (removing || frames.length <= 1 || dragIndex !== null) return;

    playUiSound("delete");

    const strip = stripRef.current;
    const item = strip?.querySelector(
      `[data-frame-index="${activeIndex}"]`,
    ) as HTMLElement | null;
    const thumb = item?.querySelector(".timeline-thumb") as HTMLElement | null;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!strip || !item || !thumb || reduceMotion) {
      onRemove();
      return;
    }

    setRemoving(true);
    thumb.classList.add("is-removing");

    removeTlRef.current = gsap.timeline({
      onComplete: () => {
        pendingFlipRef.current = Flip.getState(
          strip.querySelectorAll(".timeline-strip-item"),
        );
        onRemove();
      },
    });
    removeTlRef.current.to(thumb, {
      scale: 0,
      duration: 0.25,
      ease: "power2.in",
    });
  };

  const handleThumbPointerDown = (
    index: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (removing) return;
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
        <button
          type="button"
          className={`timeline__btn${playing ? " is-active" : ""}`}
          onClick={() => {
            playUiSound("push");
            onTogglePlay();
          }}
          aria-label={playing ? "Stop" : "Play"}
          aria-pressed={playing}
          title={playing ? "Stop" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="6,5 19,12 6,19" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="timeline__btn"
          onClick={handleRemoveClick}
          disabled={frames.length <= 1 || removing}
          aria-label="Remove frame"
          title="Remove frame"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="4" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="timeline__btn"
          onClick={handleDuplicateClick}
          disabled={!canAddFrame || removing}
          aria-label="Duplicate current"
          title="Duplicate current"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="9"
              y="4"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <rect
              x="4"
              y="9"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            />
          </svg>
        </button>
        <button
          type="button"
          className="timeline__btn"
          onClick={handleAddClick}
          disabled={!canAddFrame || removing}
          aria-label="Add frame"
          title="Add frame"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z"
            />
          </svg>
        </button>
      </div>
      <div ref={stripRef} className="timeline__scroll">
        <div
          className={`timeline__strip${dragIndex !== null ? " is-dragging" : ""}`}
          style={{ height: thumbH }}
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
                style={{ width: thumbW, height: thumbH }}
              >
                <div
                  className="timeline-thumb-cell"
                  style={{ width: thumbW, height: thumbH }}
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
