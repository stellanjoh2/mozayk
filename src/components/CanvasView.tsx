import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(useGSAP, Flip);
import { getThumbnailRenderSize, getThumbnailSize, getGridDimensions, clientToCanvasPixel, pixelToGridCell } from "../grid/gridMath";
import {
  drawCoverImage,
  ensureCachedSourceImage,
  getCachedSourceImage,
} from "../import/imageSource";
import { renderMosaic } from "../render/renderFrame";
import { isExtrasEnabled } from "../render/bonusFx";
import { isGridBlurActive } from "../render/gridBlur";
import { renderPieceOverlay, heldPiecePulseOpacity, hoverBlinkVisible, selectionPulseOpacity } from "../render/pieceOverlay";
import {
  canMoveBlock,
  buildDropZoneLoops,
  findDropTargets,
  hitTestBlock,
  pickDropTarget,
  type GridSlot,
} from "../layout/blockPlacement";
import {
  GIPHY_DURATION_MAX_S,
  PLAYBACK_FPS_OPTIONS,
  getPreviewSize,
  getPreviewSizeForDisplay,
  playbackDurationSeconds,
} from "../config";
import type { Frame, Orientation } from "../types";
import { PlayIcon, StopIcon } from "../ui/icons";
import { playUiSound } from "../ui/sounds";
import { getNormalHoverEffects } from "../ui/hover";
import { FrameContextMenu } from "./FrameContextMenu";
import { PhaseOrb } from "./PhaseOrb";
import { UiSelect } from "./UiSelect";

const STAGE_PADDING = 24;
const PIECE_DRAG_THRESHOLD = 4;

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

function InspectIcon({ minus = false }: { minus?: boolean }) {
  return (
    <svg className="canvas-stage-control-icon" viewBox="0 0 160 160" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={
          minus
            ? "M80,0C35.82,0,0,35.82,0,80s35.82,80,80,80,80-35.82,80-80S124.18,0,80,0ZM120.52,90h-81.04v-20h81.04Z"
            : "M80,0C35.82,0,0,35.82,0,80s35.82,80,80,80,80-35.82,80-80S124.18,0,80,0ZM120.52,90h-30.52v30.52h-20v-30.52h-30.52v-20h30.52v-30.52h20v30.52h30.52v20Z"
        }
      />
    </svg>
  );
}

type CanvasViewProps = {
  frame: Frame;
  orientation: Orientation;
  viewOriginal?: boolean;
  isFullscreen?: boolean;
  isInspecting?: boolean;
  fillStage?: boolean;
  pieceEditingEnabled?: boolean;
  /** Timeline is playing — skip grid blur (CSS blur at 4K/30fps OOMs the GPU). */
  playing?: boolean;
  shortcutLegend?: { text: string; id: number } | null;
  onToggleInspect?: () => void;
  onMoveBlock?: (blockIndex: number, toCol: number, toRow: number) => void;
  /** Live mosaic backing store — GIF export downscales from this size. */
  onWorkingCanvasSize?: (width: number, height: number) => void;
};

export function CanvasView({
  frame,
  orientation,
  viewOriginal = false,
  isFullscreen = false,
  isInspecting = false,
  fillStage = false,
  pieceEditingEnabled = false,
  playing = false,
  shortcutLegend = null,
  onToggleInspect,
  onMoveBlock,
  onWorkingCanvasSize,
}: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [backgroundImage, setBackgroundImage] =
    useState<HTMLImageElement | null>(null);
  const [textureOverlayImage, setTextureOverlayImage] =
    useState<HTMLImageElement | null>(null);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(
    null,
  );
  const [isDraggingPiece, setIsDraggingPiece] = useState(false);
  const [dropTargets, setDropTargets] = useState<GridSlot[]>([]);
  const [hoveredTarget, setHoveredTarget] = useState<GridSlot | null>(null);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [pieceDropBlink, setPieceDropBlink] = useState<{
    blockIndex: number;
  } | null>(null);
  const [dropBlinkT, setDropBlinkT] = useState<number | null>(null);
  const pulseRafRef = useRef<number | null>(null);
  const pulseStartRef = useRef(0);
  const dropBlinkRafRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const grabOffsetRef = useRef({ col: 0, row: 0 });
  const selectedBlockIndexRef = useRef<number | null>(null);
  const isDraggingPieceRef = useRef(false);
  const dropTargetsRef = useRef<GridSlot[]>([]);
  const lastHoveredSlotRef = useRef<string | null>(null);
  const gridRef = useRef<ReturnType<typeof getGridDimensions> | null>(null);
  const blocksRef = useRef(frame.blocks);
  const onMoveBlockRef = useRef(onMoveBlock);

  const stagePadding = isFullscreen ? 0 : STAGE_PADDING;
  const [availW, availH] = stageAvailableSize(
    stageSize.width,
    stageSize.height,
    stagePadding,
  );
  const nativeSize = getPreviewSize(orientation);
  const workingSize =
    stageSize.width > 0
      ? getPreviewSizeForDisplay(
          orientation,
          availW,
          availH,
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        )
      : nativeSize;
  // Inspect is 1:1 1080p. Playback keeps the paused preview size so overlay
  // strokes don't jump; skipGridBlur is what keeps 4K/30fps from OOMing.
  const [width, height] = isInspecting ? nativeSize : workingSize;
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

  const [workingWidth, workingHeight] = workingSize;
  useEffect(() => {
    onWorkingCanvasSize?.(workingWidth, workingHeight);
  }, [workingWidth, workingHeight, onWorkingCanvasSize]);

  useEffect(() => {
    setSelectedBlockIndex(null);
    setIsDraggingPiece(false);
    setDropTargets([]);
    setHoveredTarget(null);
    setPieceDropBlink(null);
  }, [frame.id]);

  useEffect(() => {
    if (!pieceDropBlink) {
      if (dropBlinkRafRef.current != null) {
        cancelAnimationFrame(dropBlinkRafRef.current);
        dropBlinkRafRef.current = null;
      }
      setDropBlinkT(null);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 500;
      if (t >= 1) {
        setPieceDropBlink(null);
        setDropBlinkT(null);
        dropBlinkRafRef.current = null;
        return;
      }
      setDropBlinkT(t);
      dropBlinkRafRef.current = requestAnimationFrame(tick);
    };
    dropBlinkRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (dropBlinkRafRef.current != null) {
        cancelAnimationFrame(dropBlinkRafRef.current);
        dropBlinkRafRef.current = null;
      }
    };
  }, [pieceDropBlink]);

  useEffect(() => {
    selectedBlockIndexRef.current = selectedBlockIndex;
  }, [selectedBlockIndex]);

  useEffect(() => {
    isDraggingPieceRef.current = isDraggingPiece;
  }, [isDraggingPiece]);

  useEffect(() => {
    dropTargetsRef.current = dropTargets;
  }, [dropTargets]);

  useEffect(() => {
    if (!isDraggingPiece) {
      lastHoveredSlotRef.current = null;
      return;
    }
    if (!hoveredTarget) {
      lastHoveredSlotRef.current = null;
      return;
    }
    const key = `${hoveredTarget.col},${hoveredTarget.row}`;
    if (lastHoveredSlotRef.current === key) return;
    lastHoveredSlotRef.current = key;
    playUiSound("hover");
  }, [isDraggingPiece, hoveredTarget]);

  const grid =
    width > 0 && height > 0
      ? getGridDimensions(orientation, frame.settings.density, width, height)
      : null;
  gridRef.current = grid;
  blocksRef.current = frame.blocks;
  onMoveBlockRef.current = onMoveBlock;

  const canInspect =
    orientation === "portrait" && !isFullscreen && onToggleInspect != null;
  const canEditPieces =
    pieceEditingEnabled && !isInspecting && !viewOriginal;
  const selectedBlock =
    selectedBlockIndex != null ? frame.blocks[selectedBlockIndex] ?? null : null;
  const dropZoneLoops = useMemo(() => {
    if (!isDraggingPiece || !selectedBlock || dropTargets.length === 0) {
      return [];
    }
    return buildDropZoneLoops(dropTargets, {
      width: selectedBlock.width,
      height: selectedBlock.height,
    });
  }, [isDraggingPiece, selectedBlock, dropTargets]);

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
    if (!frame.backgroundImage) {
      setBackgroundImage(null);
      return;
    }

    let cancelled = false;
    void ensureCachedSourceImage(frame.backgroundImage.dataUrl)
      .then((image) => {
        if (!cancelled) setBackgroundImage(image);
      })
      .catch(() => {
        if (!cancelled) setBackgroundImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [frame.backgroundImage?.dataUrl]);

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

    const draw = () => {
      if (viewOriginal && sourceImage) {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        drawCoverImage(ctx, sourceImage, width, height);
        return;
      }

      try {
        const showSelectionPulse =
          canEditPieces &&
          selectedBlockIndex != null &&
          !isDraggingPiece;
        const showDragPreview =
          isDraggingPiece &&
          selectedBlockIndex != null &&
          hoveredTarget;
        const rect = canvas.getBoundingClientRect();
        const displayScale =
          rect.width > 0 ? width / rect.width : 1;
        renderMosaic(canvas, {
          orientation,
          settings: frame.settings,
          blocks: frame.blocks,
          width,
          height,
          sourceImage: frame.settings.showSourceImage ? sourceImage : null,
          backgroundImage,
          textureOverlayImage,
          selectedBlockIndex: showSelectionPulse ? selectedBlockIndex : null,
          selectionPulseOpacity: showSelectionPulse
            ? selectionPulseOpacity(pulsePhase)
            : undefined,
          dragPreview: showDragPreview
            ? {
                blockIndex: selectedBlockIndex,
                col: hoveredTarget.col,
                row: hoveredTarget.row,
              }
            : null,
          dragPreviewPulseOpacity: showDragPreview
            ? heldPiecePulseOpacity(pulsePhase)
            : undefined,
          dropBlinkBlockIndex: pieceDropBlink?.blockIndex ?? null,
          dropBlinkT,
          showDensityGrid: isDraggingPiece,
          displayScale,
          skipGridBlur: playing,
        });
      } catch (error) {
        console.error(error);
      }
    };

    // Playback is already rAF-paced — draw this frame now so we don't fall a
    // paint behind and pile up mosaic renders.
    if (playing) {
      draw();
      return;
    }

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      draw();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [
    viewOriginal,
    sourceImage,
    backgroundImage,
    textureOverlayImage,
    frame.settings,
    frame.blocks,
    frame.id,
    frame.imageSource,
    frame.backgroundImage,
    frame.textureOverlay,
    orientation,
    width,
    height,
    canEditPieces,
    selectedBlockIndex,
    isDraggingPiece,
    pulsePhase,
    hoveredTarget,
    pieceDropBlink,
    dropBlinkT,
    playing,
  ]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !grid) return;

    const rect = canvas?.getBoundingClientRect();
    const displayScale =
      rect && rect.width > 0 ? grid.width / rect.width : 1;

    const heldPreview =
      isDraggingPiece && selectedBlock && hoveredTarget
        ? {
            ...selectedBlock,
            col: hoveredTarget.col,
            row: hoveredTarget.row,
          }
        : null;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const extrasOn = isExtrasEnabled(frame.settings);
    renderPieceOverlay(overlay, grid, {
      dropZoneLoops: isDraggingPiece ? dropZoneLoops : [],
      displayScale,
      heldBlock: heldPreview,
      heldStrokeVisible:
        heldPreview != null &&
        (reduceMotion ||
          getNormalHoverEffects() ||
          hoverBlinkVisible(pulsePhase)),
      cornerRadius: extrasOn ? frame.settings.cornerRadius : 0,
      shapeGap: extrasOn ? frame.settings.shapeGap : 0,
    });
  }, [
    grid,
    isDraggingPiece,
    dropZoneLoops,
    selectedBlock,
    hoveredTarget,
    pulsePhase,
    frame.settings.cornerRadius,
    frame.settings.shapeGap,
    frame.settings.extrasEnabled,
    width,
    height,
    stageSize.width,
    stageSize.height,
  ]);

  useEffect(() => {
    if (!canEditPieces || selectedBlockIndex == null) {
      if (pulseRafRef.current != null) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      return;
    }

    pulseStartRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - pulseStartRef.current) / 1000;
      const hz = isDraggingPieceRef.current ? 2 : 1;
      setPulsePhase((elapsed * hz) % 1);
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (pulseRafRef.current != null) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
    };
  }, [canEditPieces, selectedBlockIndex, isDraggingPiece]);

  const resolveHoveredTarget = (
    clientX: number,
    clientY: number,
    targets: GridSlot[],
    blockIndex: number,
  ): GridSlot | null => {
    const canvas = canvasRef.current;
    const currentGrid = gridRef.current;
    if (!canvas || !currentGrid) return null;
    const { x, y } = clientToCanvasPixel(canvas, clientX, clientY);
    const cell = pixelToGridCell(currentGrid, x, y);
    if (!cell) return null;
    const block = blocksRef.current[blockIndex];
    if (!block) return null;
    const grab = grabOffsetRef.current;
    return pickDropTarget(
      targets,
      cell.col,
      cell.row,
      block.width,
      block.height,
      grab.col,
      grab.row,
    );
  };

  const clearPieceSelection = () => {
    setSelectedBlockIndex(null);
    selectedBlockIndexRef.current = null;
  };

  const finishPieceDrag = (
    clientX: number,
    clientY: number,
    blockIndex: number,
    targets: GridSlot[],
  ) => {
    const currentGrid = gridRef.current;
    const target = resolveHoveredTarget(clientX, clientY, targets, blockIndex);
    if (
      currentGrid &&
      target &&
      canMoveBlock(
        blocksRef.current,
        blockIndex,
        target.col,
        target.row,
        currentGrid.columns,
        currentGrid.rows,
      )
    ) {
      onMoveBlockRef.current?.(blockIndex, target.col, target.row);
      playUiSound("drop");
      setPieceDropBlink({ blockIndex });
    }
    clearPieceSelection();
    setIsDraggingPiece(false);
    setDropTargets([]);
    setHoveredTarget(null);
    dragPointerIdRef.current = null;
    dragStartRef.current = null;
  };

  const clearPiecePointer = () => {
    setIsDraggingPiece(false);
    setDropTargets([]);
    setHoveredTarget(null);
    dragPointerIdRef.current = null;
    dragStartRef.current = null;
  };

  const handlePiecePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canEditPieces || !grid || !onMoveBlock) return;
    if (event.button !== 0) return;

    const { x, y } = clientToCanvasPixel(
      event.currentTarget,
      event.clientX,
      event.clientY,
    );
    const cell = pixelToGridCell(grid, x, y);
    if (!cell) {
      clearPieceSelection();
      return;
    }

    const hitIndex = hitTestBlock(frame.blocks, cell.col, cell.row);
    if (hitIndex == null) {
      clearPieceSelection();
      return;
    }

    event.preventDefault();
    dragPointerIdRef.current = event.pointerId;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    const hitBlock = frame.blocks[hitIndex];
    grabOffsetRef.current = {
      col: cell.col - hitBlock.col,
      row: cell.row - hitBlock.row,
    };

    if (selectedBlockIndexRef.current === hitIndex) {
      const targets = findDropTargets(
        frame.blocks,
        hitIndex,
        grid.columns,
        grid.rows,
      );
      setIsDraggingPiece(true);
      setDropTargets(targets);
      setHoveredTarget(
        resolveHoveredTarget(event.clientX, event.clientY, targets, hitIndex),
      );
    } else {
      setSelectedBlockIndex(hitIndex);
      setIsDraggingPiece(false);
      setDropTargets([]);
    }
  };

  useEffect(() => {
    if (!canEditPieces) {
      clearPiecePointer();
      return;
    }

    const onMove = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;

      const blockIndex = selectedBlockIndexRef.current;
      const currentGrid = gridRef.current;
      if (blockIndex == null || !currentGrid) return;

      let targets = dropTargetsRef.current;

      if (!isDraggingPieceRef.current && dragStartRef.current) {
        const dx = event.clientX - dragStartRef.current.x;
        const dy = event.clientY - dragStartRef.current.y;
        if (Math.hypot(dx, dy) >= PIECE_DRAG_THRESHOLD) {
          targets = findDropTargets(
            blocksRef.current,
            blockIndex,
            currentGrid.columns,
            currentGrid.rows,
          );
          isDraggingPieceRef.current = true;
          dropTargetsRef.current = targets;
          setIsDraggingPiece(true);
          setDropTargets(targets);
        }
      }

      if (isDraggingPieceRef.current) {
        const activeTargets =
          targets.length > 0
            ? targets
            : findDropTargets(
                blocksRef.current,
                blockIndex,
                currentGrid.columns,
                currentGrid.rows,
              );
        setHoveredTarget(
          resolveHoveredTarget(
            event.clientX,
            event.clientY,
            activeTargets,
            blockIndex,
          ),
        );
        if (event.cancelable) event.preventDefault();
      }
    };

    const onUp = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;

      const blockIndex = selectedBlockIndexRef.current;
      const currentGrid = gridRef.current;
      if (blockIndex != null && isDraggingPieceRef.current && currentGrid) {
        const targets =
          dropTargetsRef.current.length > 0
            ? dropTargetsRef.current
            : findDropTargets(
                blocksRef.current,
                blockIndex,
                currentGrid.columns,
                currentGrid.rows,
              );
        finishPieceDrag(event.clientX, event.clientY, blockIndex, targets);
      } else {
        dragPointerIdRef.current = null;
        dragStartRef.current = null;
      }
    };

    const onCancel = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      clearPiecePointer();
    };

    const onOutsidePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (selectedBlockIndexRef.current == null) return;
      if (isDraggingPieceRef.current) return;
      const canvas = canvasRef.current;
      if (
        canvas &&
        event.target instanceof Node &&
        canvas.contains(event.target)
      ) {
        return;
      }
      clearPieceSelection();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("pointerdown", onOutsidePointerDown, true);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointerdown", onOutsidePointerDown, true);
    };
  }, [canEditPieces]);

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
    : fillStage
      ? Math.max(1, Math.round(stageSize.width) || width)
      : Math.max(1, Math.round(width * fitScale));
  const displayHeight = isInspecting
    ? nativeSize[1]
    : fillStage
      ? Math.max(1, Math.round(stageSize.height) || height)
      : Math.max(1, Math.round(displayWidth * (height / width)));

  const showPieceCursor = canEditPieces && selectedBlockIndex != null;
  const pieceCursorClass = isDraggingPiece
    ? "is-grabbing-piece"
    : showPieceCursor
      ? "is-grab-piece"
      : canEditPieces
        ? "is-piece-select"
        : "";

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
        <div
          className="mosaic-canvas-stack"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <canvas
            ref={canvasRef}
            className={[
              "mosaic-canvas",
              canInspect && isInspecting ? "is-zoom-out" : "",
              pieceCursorClass,
            ]
              .filter(Boolean)
              .join(" ")}
            width={width}
            height={height}
            style={{
              width: displayWidth,
              height: displayHeight,
            }}
            onClick={canInspect && isInspecting ? onToggleInspect : undefined}
            onPointerDown={canEditPieces ? handlePiecePointerDown : undefined}
            aria-label={
              viewOriginal && frame.imageSource
                ? "Original photo preview"
                : "Mosaic preview"
            }
          />
          <canvas
            ref={overlayRef}
            className="mosaic-overlay"
            aria-hidden="true"
            width={width}
            height={height}
            style={{
              width: displayWidth,
              height: displayHeight,
            }}
          />
        </div>
      </div>
      {viewOriginal && frame.imageSource ? (
        <span className="canvas-view-original-badge">Original</span>
      ) : null}
      {shortcutLegend ? (
        <span
          key={shortcutLegend.id}
          className="canvas-view-original-badge canvas-shortcut-legend"
        >
          {shortcutLegend.text}
        </span>
      ) : null}
      {canInspect ? (
        <div className="canvas-stage-controls">
          <button
            type="button"
            className={`canvas-stage-control-btn${isInspecting ? " is-active" : ""}`}
            data-shortcut="Escape"
            onClick={() => {
              playUiSound("push");
              onToggleInspect?.();
            }}
            aria-label={
              isInspecting
                ? "Exit 100% inspect"
                : `Inspect at 100% (${nativeSize[0]}×${nativeSize[1]})`
            }
            aria-pressed={isInspecting}
            title={
              isInspecting
                ? "Exit 100% inspect"
                : `Inspect at 100% (${nativeSize[0]}×${nativeSize[1]})`
            }
          >
            <InspectIcon minus={isInspecting} />
          </button>
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
  dropFlashToken?: number;
  onSelect?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
};

function FrameThumbnail({
  frame,
  orientation,
  active,
  hidden = false,
  dropFlashToken,
  onSelect,
  onPointerDown,
  onContextMenu,
}: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skippedClickRef = useRef(false);
  const [thumbW, thumbH] = getThumbnailSize(orientation);
  const [renderW, renderH] = getThumbnailRenderSize(orientation);
  const overlayDataUrl = frame.textureOverlay?.dataUrl;
  const backgroundDataUrl = frame.backgroundImage?.dataUrl;
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [backgroundImage, setBackgroundImage] =
    useState<HTMLImageElement | null>(() =>
      backgroundDataUrl ? getCachedSourceImage(backgroundDataUrl) ?? null : null,
    );
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
    if (!backgroundDataUrl) {
      setBackgroundImage(null);
      return;
    }

    const cached = getCachedSourceImage(backgroundDataUrl);
    if (cached) {
      setBackgroundImage(cached);
      return;
    }

    let cancelled = false;
    void ensureCachedSourceImage(backgroundDataUrl)
      .then((image) => {
        if (!cancelled) setBackgroundImage(image);
      })
      .catch(() => {
        if (!cancelled) setBackgroundImage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [backgroundDataUrl]);

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
        backgroundImage,
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
    frame.backgroundImage,
    frame.textureOverlay,
    orientation,
    renderW,
    renderH,
    sourceImage,
    backgroundImage,
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
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
      }}
      aria-label={`Frame preview${active ? ", selected" : ""}`}
    >
      <canvas ref={canvasRef} width={renderW} height={renderH} />
      {dropFlashToken != null ? (
        <span
          key={dropFlashToken}
          className="timeline-thumb__drop-flash"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

const DRAG_THRESHOLD = 5;
const FRAME_SLOT_COLLAPSE_S = 0.45;

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

const MIN_TIMELINE_SCROLL_THUMB = 24;

function timelineThumbLayout(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  trackWidth: number,
): { thumbWidth: number; thumbLeft: number } {
  if (scrollWidth <= 0 || trackWidth <= 0) {
    return { thumbWidth: 0, thumbLeft: 0 };
  }
  const thumbWidth = Math.min(
    trackWidth,
    Math.max(
      MIN_TIMELINE_SCROLL_THUMB,
      (clientWidth / scrollWidth) * trackWidth,
    ),
  );
  const maxScroll = scrollWidth - clientWidth;
  const maxThumbLeft = trackWidth - thumbWidth;
  const thumbLeft =
    maxScroll <= 0 || maxThumbLeft <= 0
      ? 0
      : (scrollLeft / maxScroll) * maxThumbLeft;
  return {
    thumbWidth: Math.round(thumbWidth),
    thumbLeft: Math.round(thumbLeft),
  };
}

function scrollTimelineByTrackDelta(
  scroller: HTMLElement,
  trackWidth: number,
  startScrollLeft: number,
  deltaX: number,
): void {
  const { clientWidth, scrollWidth } = scroller;
  const { thumbWidth } = timelineThumbLayout(
    0,
    clientWidth,
    scrollWidth,
    trackWidth,
  );
  const maxThumbLeft = trackWidth - thumbWidth;
  const maxScroll = scrollWidth - clientWidth;
  if (maxThumbLeft <= 0 || maxScroll <= 0) return;
  scroller.scrollLeft = startScrollLeft + (deltaX / maxThumbLeft) * maxScroll;
}

function scrollTimelineToTrackX(
  scroller: HTMLElement,
  track: HTMLElement,
  clientX: number,
): void {
  const trackWidth = track.getBoundingClientRect().width;
  const { thumbWidth } = timelineThumbLayout(
    0,
    scroller.clientWidth,
    scroller.scrollWidth,
    trackWidth,
  );
  const maxThumbLeft = trackWidth - thumbWidth;
  const maxScroll = scroller.scrollWidth - scroller.clientWidth;
  if (maxThumbLeft <= 0 || maxScroll <= 0) return;
  const x = clientX - track.getBoundingClientRect().left - thumbWidth / 2;
  const ratio = Math.min(1, Math.max(0, x / maxThumbLeft));
  scroller.scrollLeft = ratio * maxScroll;
}

/** Instantly keep the playhead on-screen; jumps a page when it leaves the view. */
function keepTimelineThumbVisible(
  scroller: HTMLElement,
  thumb: HTMLElement,
): void {
  const scrollerRect = scroller.getBoundingClientRect();
  const thumbRect = thumb.getBoundingClientRect();
  const margin = 8;
  if (
    thumbRect.left >= scrollerRect.left + margin &&
    thumbRect.right <= scrollerRect.right - margin
  ) {
    return;
  }
  scroller.scrollLeft += thumbRect.left - scrollerRect.left - margin;
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
  const inner = (strip.querySelector(".timeline__strip") ?? strip) as HTMLElement;
  const x = clientX - inner.getBoundingClientRect().left;
  const slots = Array.from(
    inner.querySelectorAll<HTMLElement>("[data-timeline-slot]"),
  );
  if (slots.length === 0) return 0;

  for (const slot of slots) {
    const mid = slot.offsetLeft + slot.offsetWidth / 2;

    if (slot.dataset.insertIndex !== undefined) {
      if (x < mid) return Number(slot.dataset.insertIndex);
      continue;
    }

    const frameIndex = Number(slot.dataset.frameIndex);
    if (x < mid) return frameIndex;
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
  playbackFps: number;
  onPlaybackFpsChange: (fps: number) => void;
  onSelect: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onCopyStyle: (index: number) => void;
  onPasteStyle: (index: number) => void;
  canPasteStyle: boolean;
  canAddFrame: boolean;
  onTogglePlay: () => void;
};

export function Timeline({
  frames,
  activeIndex,
  orientation,
  playing,
  playbackFps,
  onPlaybackFpsChange,
  onSelect,
  onReorder,
  onAdd,
  onDuplicate,
  onRemove,
  onCopyStyle,
  onPasteStyle,
  canPasteStyle,
  canAddFrame,
  onTogglePlay,
}: TimelineProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
  } | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const insertIndexRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const pendingFlipRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const pendingDragFlipRef = useRef<ReturnType<typeof Flip.getState> | null>(
    null,
  );
  const dragFlipTweenRef = useRef<gsap.core.Timeline | null>(null);
  const pendingAddRef = useRef(false);
  const addingRef = useRef(false);
  const removeTlRef = useRef<gsap.core.Timeline | null>(null);
  const [trackPointer, setTrackPointer] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [ghostOffset, setGhostOffset] = useState({ x: 0, y: 0 });
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const removing = removingIndex !== null;
  const [dropFlash, setDropFlash] = useState<{
    index: number;
    token: number;
  } | null>(null);
  const dropFlashTokenRef = useRef(0);
  const [menu, setMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const [scrollbar, setScrollbar] = useState({
    overflow: false,
    thumbWidth: 0,
    thumbLeft: 0,
  });
  const [thumbW, thumbH] = getThumbnailSize(orientation);

  useGSAP(() => {
    return () => {
      removeTlRef.current?.kill();
      dragFlipTweenRef.current?.kill();
      pendingFlipRef.current = null;
      pendingDragFlipRef.current = null;
    };
  }, { scope: stripRef });

  useEffect(() => {
    if (dragIndex === null) return;
    setMenu(null);
  }, [dragIndex]);

  useEffect(() => {
    if (!dropFlash) return;
    const token = dropFlash.token;
    const timer = window.setTimeout(() => {
      setDropFlash((prev) => (prev?.token === token ? null : prev));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [dropFlash]);

  useEffect(() => {
    if (removing || addingRef.current || menu) return;
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector(
      ".timeline-thumb.is-active",
    ) as HTMLElement | null;
    if (!active) return;

    if (playing) {
      keepTimelineThumbVisible(strip, active);
      return;
    }

    active.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeIndex, frames.length, removing, playing, menu]);

  useLayoutEffect(() => {
    const scroller = stripRef.current;
    if (!scroller) return;

    const updateScrollbar = () => {
      const overflow = scroller.scrollWidth - scroller.clientWidth > 1;
      const next = overflow
        ? {
            overflow: true,
            ...timelineThumbLayout(
              scroller.scrollLeft,
              scroller.clientWidth,
              scroller.scrollWidth,
              scroller.clientWidth,
            ),
          }
        : { overflow: false, thumbWidth: 0, thumbLeft: 0 };
      setScrollbar((prev) =>
        prev.overflow === next.overflow &&
        prev.thumbWidth === next.thumbWidth &&
        prev.thumbLeft === next.thumbLeft
          ? prev
          : next,
      );
    };

    updateScrollbar();
    scroller.addEventListener("scroll", updateScrollbar, { passive: true });
    const observer = new ResizeObserver(updateScrollbar);
    observer.observe(scroller);
    const inner = scroller.firstElementChild;
    if (inner) observer.observe(inner);

    return () => {
      scroller.removeEventListener("scroll", updateScrollbar);
      observer.disconnect();
    };
  }, [frames.length, thumbW]);

  useLayoutEffect(() => {
    if (!trackPointer) return;

    const updateInsertIndex = (next: number | null) => {
      if (next === insertIndexRef.current) return;

      const strip = stripRef.current;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (
        strip &&
        !reduceMotion &&
        insertIndexRef.current !== null &&
        next !== null
      ) {
        pendingDragFlipRef.current = Flip.getState(
          strip.querySelectorAll(".timeline-strip-item"),
        );
      } else {
        pendingDragFlipRef.current = null;
      }

      insertIndexRef.current = next;
      setInsertIndex(next);
    };

    const finishDrag = (commit: boolean) => {
      const pending = pendingDragRef.current;
      pendingDragRef.current = null;
      setTrackPointer(false);

      if (commit && draggedRef.current) {
        playUiSound("drop");
        let flashIndex = pending?.index ?? null;
        if (pending && insertIndexRef.current !== null) {
          const target = insertIndexToTarget(pending.index, insertIndexRef.current);
          flashIndex = target;
          if (target !== pending.index) {
            onReorder(pending.index, target);
          }
        }
        if (flashIndex !== null) {
          dropFlashTokenRef.current += 1;
          setDropFlash({
            index: flashIndex,
            token: dropFlashTokenRef.current,
          });
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
    if (insertIndex === null) {
      pendingDragFlipRef.current = null;
      dragFlipTweenRef.current?.kill();
      dragFlipTweenRef.current = null;
      const items = stripRef.current?.querySelectorAll(".timeline-strip-item");
      if (items?.length) gsap.set(items, { clearProps: "transform" });
      return;
    }

    const state = pendingDragFlipRef.current;
    if (!state) return;

    const items = stripRef.current?.querySelectorAll(".timeline-strip-item");
    dragFlipTweenRef.current?.kill();
    if (items?.length) gsap.set(items, { clearProps: "transform" });

    const tween = Flip.from(state, {
      duration: 0.22,
      ease: "power2.out",
      absolute: false,
      scale: false,
      simple: true,
    });
    dragFlipTweenRef.current = tween;
    return () => {
      tween.kill();
    };
  }, [insertIndex]);

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
        flashNew();
      },
    });
    return () => {
      tween.kill();
      window.clearTimeout(flashTimer);
      if (newThumb) {
        gsap.set(newThumb, { autoAlpha: 1, clearProps: "opacity,visibility" });
        newThumb.classList.remove("is-adding");
      }
      addingRef.current = false;
    };
  }, [frames]);

  useLayoutEffect(() => {
    if (removingIndex === null) return;

    const strip = stripRef.current;
    const item = strip?.querySelector(
      `[data-frame-index="${removingIndex}"]`,
    ) as HTMLElement | null;
    const thumb = item?.querySelector(".timeline-thumb") as HTMLElement | null;
    if (!strip || !item || !thumb) {
      onRemove(removingIndex);
      setRemovingIndex(null);
      return;
    }

    const gap = parseFloat(
      getComputedStyle(item.parentElement ?? item).columnGap,
    );
    const slotGap = Number.isFinite(gap) ? gap : 8;
    const startWidth = item.getBoundingClientRect().width;

    removeTlRef.current?.kill();
    const index = removingIndex;
    const tl = gsap.timeline({
      onComplete: () => {
        setRemovingIndex(null);
        onRemove(index);
      },
    });
    tl.fromTo(
      thumb,
      { scale: 1 },
      { scale: 0, duration: 0.25, ease: "power2.in" },
      0,
    );
    tl.fromTo(
      item,
      { width: startWidth, minWidth: startWidth, marginRight: 0 },
      {
        width: 0,
        minWidth: 0,
        marginRight: -slotGap,
        duration: FRAME_SLOT_COLLAPSE_S,
        ease: "power3.inOut",
      },
      0,
    );
    removeTlRef.current = tl;

    return () => {
      tl.kill();
    };
  }, [removingIndex, onRemove]);

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

  const handleDuplicateClick = (index: number) => {
    if (removing || !canAddFrame || dragIndex !== null) return;
    captureStripThen(() => onDuplicate(index));
  };

  const handleRemoveClick = (index: number) => {
    if (removing || frames.length <= 1 || dragIndex !== null) return;

    playUiSound("delete");

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || !stripRef.current) {
      onRemove(index);
      return;
    }

    setRemovingIndex(index);
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

  const handleScrollbarPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    const scroller = stripRef.current;
    const track = event.currentTarget;
    if (!scroller) return;

    if (event.target === track) {
      scrollTimelineToTrackX(scroller, track, event.clientX);
    }

    scrollbarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
    };
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
  };

  const handleScrollbarPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = scrollbarDragRef.current;
    const scroller = stripRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !scroller) return;
    scrollTimelineByTrackDelta(
      scroller,
      event.currentTarget.getBoundingClientRect().width,
      drag.startScrollLeft,
      event.clientX - drag.startX,
    );
  };

  const handleScrollbarPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = scrollbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    scrollbarDragRef.current = null;
  };

  const draggedFrame = dragIndex !== null ? frames[dragIndex] : null;
  const activeFrame = frames[activeIndex];
  const showBlurPlaybackNote =
    playing && activeFrame != null && isGridBlurActive(activeFrame.settings);
  const visualItems = buildVisualStripItems(
    frames.length,
    dragIndex,
    insertIndex,
  );

  return (
    <footer className="timeline">
      <div className="timeline__toolbar">
        <p className="timeline__frame-index" aria-live="polite">
          Frame {activeIndex + 1}
        </p>
        <div className="timeline__controls">
        <button
          type="button"
          className={`timeline__btn${playing ? " is-active" : ""}`}
          data-shortcut="Space"
          onClick={() => {
            playUiSound("push");
            onTogglePlay();
          }}
          aria-label={playing ? "Stop" : "Play"}
          aria-pressed={playing}
          title={playing ? "Stop" : "Play"}
        >
          {playing ? <StopIcon /> : <PlayIcon />}
        </button>
        <UiSelect
          className="timeline__fps"
          value={playbackFps}
          aria-label="Playback speed"
          title="Playback speed"
          options={PLAYBACK_FPS_OPTIONS.map((fps) => ({
            value: String(fps),
            label: `${fps} FPS`,
            disabled:
              playbackDurationSeconds(frames.length, fps) > GIPHY_DURATION_MAX_S,
          }))}
          onChange={(fps) => {
            playUiSound("push");
            onPlaybackFpsChange(Number(fps));
          }}
        />
        <button
          type="button"
          className="timeline__btn"
          onClick={() => handleRemoveClick(activeIndex)}
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
          onClick={() => handleDuplicateClick(activeIndex)}
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
        {playing ? (
          <div className="timeline__playback-status">
            {showBlurPlaybackNote ? (
              <p className="timeline__blur-note" aria-live="polite">
                Blur deactivated for performance
              </p>
            ) : null}
            <div className="timeline__phase-orb" aria-hidden="true">
              <PhaseOrb />
            </div>
          </div>
        ) : null}
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
                className={`timeline-strip-item${index === removingIndex ? " is-removing" : ""}`}
                data-timeline-slot
                data-frame-index={index}
                style={{
                  height: thumbH,
                  ...(index === removingIndex ? {} : { width: thumbW }),
                }}
              >
                <div
                  className="timeline-thumb-cell"
                  style={{ width: thumbW, height: thumbH }}
                >
                  <FrameThumbnail
                    frame={frame}
                    orientation={orientation}
                    active={index === activeIndex}
                    dropFlashToken={
                      dropFlash?.index === index ? dropFlash.token : undefined
                    }
                    onSelect={() => onSelect(index)}
                    onPointerDown={(event) => handleThumbPointerDown(index, event)}
                    onContextMenu={(event) => {
                      if (removing || dragIndex !== null) return;
                      onSelect(index);
                      playUiSound("push");
                      setMenu({
                        index,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {scrollbar.overflow ? (
        <div
          className="timeline__scrollbar"
          role="scrollbar"
          aria-orientation="horizontal"
          aria-label="Timeline frames"
          onPointerDown={handleScrollbarPointerDown}
          onPointerMove={handleScrollbarPointerMove}
          onPointerUp={handleScrollbarPointerUp}
          onPointerCancel={handleScrollbarPointerUp}
          onLostPointerCapture={handleScrollbarPointerUp}
        >
          <div
            className="timeline__scrollbar-thumb"
            style={{
              width: scrollbar.thumbWidth,
              left: scrollbar.thumbLeft,
            }}
          />
        </div>
      ) : null}
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
      {menu ? (
        <FrameContextMenu
          key={`${menu.index}-${menu.x}-${menu.y}`}
          x={menu.x}
          y={menu.y}
          canPaste={canPasteStyle}
          canDuplicate={canAddFrame}
          canDelete={frames.length > 1}
          onCopyStyle={() => {
            playUiSound("ok");
            onCopyStyle(menu.index);
          }}
          onPasteStyle={() => {
            playUiSound("ok");
            onPasteStyle(menu.index);
          }}
          onDuplicate={() => {
            handleDuplicateClick(menu.index);
          }}
          onDelete={() => {
            handleRemoveClick(menu.index);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </footer>
  );
}
