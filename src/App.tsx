import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FPS, type ExportPreset } from "./config";
import { CanvasView, Timeline } from "./components/CanvasView";
import { ControlsPanel, MAX_FRAMES } from "./components/ControlsPanel";
import { ImportErrorDialog } from "./components/ImportErrorDialog";
import { exportAllFrames, exportCurrentFrame, exportCurrentFrameTransparent } from "./export/exportPng";
import { exportCurrentFrameSvg } from "./export/exportSvg";
import {
  patchNeedsImportedLayoutRegen,
  patchNeedsLayoutRegen,
  rerollShapes,
} from "./layout/generateLayout";
import {
  addColorToSettings,
  applyDensityChange,
  applyImageImport,
  applyPastedSettings,
  clampSettingsForOrientation,
  colorAmountsForSettings,
  colorsLockedForSettings,
  createInitialFrame,
  createDefaultCanvas,
  activeIndexAfterReorder,
  createDefaultShapePalette,
  duplicateFrame,
  regenerateFrameLayout,
  relayoutImportedFrame,
  reorderFrames,
  randomizeFrameCurrentColors,
  randomizeFrameNewColors,
  randomizeFrameLayout,
  removeColorFromFrame,
  transposeFrameBlocks,
} from "./state/frameUtils";
import {
  copySettings,
  hasStoredSettings,
  readSettingsClipboard,
} from "./state/settingsClipboard";
import {
  captureCanvasSnapshot,
  pushSnapshot,
  type CanvasSnapshot,
} from "./state/undoHistory";
import { importImageFileToMosaic } from "./import/imageImport";
import {
  ensureCachedSourceImage,
  readImageFileAsDataUrl,
} from "./import/imageSource";
import {
  UnsupportedImageTypeError,
  unsupportedImageMessage,
  validateImageFile,
} from "./import/supportedImageTypes";
import type { Frame, FrameSettings, Orientation } from "./types";

import "./App.css";

const LAYOUT_REGEN_MS = 280;
/** Idle gap after which continuous edits (sliders) become a new undo step. */
const UNDO_COALESCE_MS = 400;

function getFullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function requestAppFullscreen(app: HTMLElement): Promise<void> {
  if (app.requestFullscreen) return app.requestFullscreen();
  const webkitRequest = (
    app as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
  ).webkitRequestFullscreen;
  if (webkitRequest) return webkitRequest.call(app);
  return Promise.reject(new Error("Fullscreen not supported"));
}

function exitAppFullscreen(): Promise<void> {
  if (document.exitFullscreen) return document.exitFullscreen();
  const webkitExit = (
    document as Document & { webkitExitFullscreen?: () => Promise<void> }
  ).webkitExitFullscreen;
  if (webkitExit) return webkitExit.call(document);
  return Promise.reject(new Error("Fullscreen not supported"));
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  const input = target as HTMLInputElement;
  return input.type === "text" || input.type === "search" || input.type === "number";
}

export default function App() {
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [frames, setFrames] = useState<Frame[]>(() => [
    createInitialFrame("landscape"),
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>("1080p");
  const [canPasteSettings, setCanPasteSettings] = useState(hasStoredSettings);
  const [importingImage, setImportingImage] = useState(false);
  const [uploadingTextureOverlay, setUploadingTextureOverlay] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(
    null,
  );
  const [viewOriginal, setViewOriginal] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const inspectingRef = useRef(inspecting);
  const [toast, setToast] = useState<string | null>(null);
  const layoutRegenTimer = useRef<number | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const orientationRef = useRef(orientation);
  const framesRef = useRef(frames);
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const applyingHistoryRef = useRef(false);
  const undoCoalesceArmedRef = useRef(false);
  const undoCoalesceTimer = useRef<number | null>(null);

  activeIndexRef.current = activeIndex;
  orientationRef.current = orientation;
  framesRef.current = frames;
  inspectingRef.current = inspecting;

  const activeFrame = frames[activeIndex] ?? frames[0];

  useEffect(() => {
    if (!activeFrame.imageSource) {
      setViewOriginal(false);
    }
  }, [activeFrame.id, activeFrame.imageSource]);

  const captureCurrentSnapshot = useCallback(
    (): CanvasSnapshot =>
      captureCanvasSnapshot(
        framesRef.current,
        activeIndexRef.current,
        orientationRef.current,
      ),
    [],
  );

  const resetUndoCoalesce = useCallback(() => {
    undoCoalesceArmedRef.current = false;
    if (undoCoalesceTimer.current) {
      window.clearTimeout(undoCoalesceTimer.current);
      undoCoalesceTimer.current = null;
    }
  }, []);

  const pushUndoCheckpoint = useCallback(
    (coalesce = false) => {
      if (applyingHistoryRef.current) return;

      if (coalesce) {
        if (!undoCoalesceArmedRef.current) {
          undoStackRef.current = pushSnapshot(
            undoStackRef.current,
            captureCurrentSnapshot(),
          );
          redoStackRef.current = [];
          undoCoalesceArmedRef.current = true;
        }
        if (undoCoalesceTimer.current) {
          window.clearTimeout(undoCoalesceTimer.current);
        }
        undoCoalesceTimer.current = window.setTimeout(() => {
          undoCoalesceArmedRef.current = false;
          undoCoalesceTimer.current = null;
        }, UNDO_COALESCE_MS);
        return;
      }

      resetUndoCoalesce();
      undoStackRef.current = pushSnapshot(
        undoStackRef.current,
        captureCurrentSnapshot(),
      );
      redoStackRef.current = [];
    },
    [captureCurrentSnapshot, resetUndoCoalesce],
  );

  const applySnapshot = useCallback((snapshot: CanvasSnapshot) => {
    if (layoutRegenTimer.current) {
      window.clearTimeout(layoutRegenTimer.current);
      layoutRegenTimer.current = null;
    }
    resetUndoCoalesce();
    applyingHistoryRef.current = true;
    orientationRef.current = snapshot.orientation;
    framesRef.current = snapshot.frames;
    activeIndexRef.current = snapshot.activeIndex;
    setOrientation(snapshot.orientation);
    setFrames(snapshot.frames);
    setActiveIndex(snapshot.activeIndex);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
  }, [resetUndoCoalesce]);

  const undo = useCallback(() => {
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previous) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = pushSnapshot(
      redoStackRef.current,
      captureCurrentSnapshot(),
    );
    applySnapshot(previous);
  }, [applySnapshot, captureCurrentSnapshot]);

  const redo = useCallback(() => {
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    if (!next) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = pushSnapshot(
      undoStackRef.current,
      captureCurrentSnapshot(),
    );
    applySnapshot(next);
  }, [applySnapshot, captureCurrentSnapshot]);

  const updateActiveFrame = useCallback((updater: (frame: Frame) => Frame) => {
    setFrames((prev) =>
      prev.map((frame, index) =>
        index === activeIndexRef.current ? updater(frame) : frame,
      ),
    );
  }, []);

  const regenerateLayout = useCallback(() => {
    updateActiveFrame((frame) =>
      regenerateFrameLayout(frame, orientationRef.current),
    );
  }, [updateActiveFrame]);

  const randomizeLayout = useCallback(() => {
    pushUndoCheckpoint();
    updateActiveFrame((frame) =>
      regenerateFrameLayout(frame, orientationRef.current),
    );
  }, [pushUndoCheckpoint, updateActiveFrame]);

  const randomizeAll = useCallback(() => {
    pushUndoCheckpoint();
    updateActiveFrame((frame) =>
      randomizeFrameLayout(frame, orientationRef.current),
    );
  }, [pushUndoCheckpoint, updateActiveFrame]);

  const scheduleLayoutRegen = useCallback(() => {
    if (layoutRegenTimer.current) {
      window.clearTimeout(layoutRegenTimer.current);
    }
    layoutRegenTimer.current = window.setTimeout(() => {
      layoutRegenTimer.current = null;
      regenerateLayout();
    }, LAYOUT_REGEN_MS);
  }, [regenerateLayout]);

  useEffect(
    () => () => {
      if (layoutRegenTimer.current) {
        window.clearTimeout(layoutRegenTimer.current);
      }
      if (undoCoalesceTimer.current) {
        window.clearTimeout(undoCoalesceTimer.current);
      }
    },
    [],
  );

  const mergeSettings = useCallback(
    (frame: Frame, patch: Partial<FrameSettings>): FrameSettings => {
      const definedPatch = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as Partial<FrameSettings>;

      let settings: FrameSettings = {
        ...frame.settings,
        scaleBlend: frame.settings.scaleBlend ?? 3,
        shapes: frame.settings.shapes ?? createDefaultShapePalette(),
        ringThickness: frame.settings.ringThickness ?? 45,
        colors: [...frame.settings.colors],
        colorAmounts: colorAmountsForSettings(frame.settings),
      };

      const shapePatch = definedPatch.shapes;
      const { shapes: _shapes, ...restPatch } = definedPatch;

      if (
        restPatch.density !== undefined &&
        restPatch.density !== settings.density
      ) {
        settings = applyDensityChange(settings, restPatch.density);
        const { density: _, ...rest } = restPatch;
        settings = {
          ...settings,
          ...rest,
          ...(shapePatch ? { shapes: { ...settings.shapes, ...shapePatch } } : {}),
          colors: [...frame.settings.colors],
        };
      } else {
        settings = {
          ...settings,
          ...restPatch,
          ...(shapePatch ? { shapes: { ...settings.shapes, ...shapePatch } } : {}),
          colors: [...frame.settings.colors],
        };
      }

      if (
        settings.layoutSource === "imported" &&
        !frame.imageSource &&
        patchNeedsLayoutRegen(definedPatch)
      ) {
        settings = { ...settings, layoutSource: "procedural" };
      }

      return clampSettingsForOrientation(
        { ...settings, colors: [...frame.settings.colors] },
        orientationRef.current,
      );
    },
    [],
  );

  const handleSettingsChange = useCallback(
    (patch: Partial<FrameSettings>, immediateLayout = false) => {
      pushUndoCheckpoint(true);
      const active = framesRef.current[activeIndexRef.current];
      const needsLayout = active?.imageSource
        ? patchNeedsImportedLayoutRegen(patch)
        : patchNeedsLayoutRegen(patch);
      const rerollsShape =
        "shapeMix" in patch || "shapes" in patch;

      if (needsLayout && immediateLayout) {
        updateActiveFrame((frame) => {
          const nextSettings = mergeSettings(frame, patch);
          return regenerateFrameLayout(
            { ...frame, settings: nextSettings },
            orientationRef.current,
          );
        });
        return;
      }

      updateActiveFrame((frame) => {
        const nextSettings = mergeSettings(frame, patch);

        let blocks = frame.blocks;
        if (rerollsShape && !needsLayout) {
          blocks = rerollShapes(blocks, nextSettings);
        }

        return { ...frame, settings: nextSettings, blocks };
      });

      if (needsLayout) {
        scheduleLayoutRegen();
      }
    },
    [mergeSettings, pushUndoCheckpoint, scheduleLayoutRegen, updateActiveFrame],
  );

  const handleOrientationChange = useCallback(
    (next: Orientation) => {
      if (next === orientation) return;
      pushUndoCheckpoint();
      setOrientation(next);
      orientationRef.current = next;
      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.imageSource) return relayoutImportedFrame(frame, next);
          if (orientation === "square" || next === "square") {
            return regenerateFrameLayout(frame, next);
          }
          return transposeFrameBlocks(frame, orientation, next);
        }),
      );
    },
    [orientation, pushUndoCheckpoint],
  );

  const handleAddFrame = useCallback(() => {
    if (framesRef.current.length >= MAX_FRAMES) return;
    pushUndoCheckpoint();
    setFrames((prev) => {
      if (prev.length >= MAX_FRAMES) return prev;
      const copy = duplicateFrame(prev[prev.length - 1] ?? prev[0]);
      const next = [...prev, copy];
      setActiveIndex(next.length - 1);
      return next;
    });
  }, [pushUndoCheckpoint]);

  const handleDuplicateCurrent = useCallback(() => {
    if (framesRef.current.length >= MAX_FRAMES) return;
    pushUndoCheckpoint();
    setFrames((prev) => {
      if (prev.length >= MAX_FRAMES) return prev;
      const sourceIndex = activeIndexRef.current;
      const source = prev[sourceIndex] ?? prev[0];
      const copy = duplicateFrame(source);
      const insertAt = sourceIndex + 1;
      const next = [...prev.slice(0, insertAt), copy, ...prev.slice(insertAt)];
      setActiveIndex(insertAt);
      return next;
    });
  }, [pushUndoCheckpoint]);

  const handleRemoveFrame = useCallback(() => {
    if (framesRef.current.length <= 1) return;
    pushUndoCheckpoint();
    const removeIndex = activeIndexRef.current;
    setFrames((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, index) => index !== removeIndex);
      setActiveIndex(Math.min(removeIndex, next.length - 1));
      return next;
    });
  }, [pushUndoCheckpoint]);

  const handleReorderFrames = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    pushUndoCheckpoint();
    setFrames((prev) => reorderFrames(prev, fromIndex, toIndex));
    setActiveIndex((index) => activeIndexAfterReorder(index, fromIndex, toIndex));
  }, [pushUndoCheckpoint]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleCopySettings = useCallback(async () => {
    await copySettings(activeFrame.settings);
    setCanPasteSettings(true);
    setToast("Settings copied");
  }, [activeFrame.settings]);

  const handlePasteSettings = useCallback(async () => {
    const pasted = await readSettingsClipboard();
    if (!pasted) {
      setToast("Nothing to paste");
      return;
    }
    pushUndoCheckpoint();
    updateActiveFrame((frame) =>
      applyPastedSettings(frame, pasted, orientationRef.current),
    );
    setToast("Settings pasted");
  }, [pushUndoCheckpoint, updateActiveFrame]);

  const runExport = useCallback(async (task: () => Promise<void> | void) => {
    try {
      await task();
    } catch {
      setToast("Export failed");
    }
  }, []);

  const handleImportImage = useCallback(
    async (file: File) => {
      try {
        validateImageFile(file);
      } catch (error) {
        if (error instanceof UnsupportedImageTypeError) {
          setImportErrorMessage(unsupportedImageMessage(error.label));
          return;
        }
        setImportErrorMessage(
          "This file could not be imported. Use JPEG, PNG, WebP, GIF, or AVIF instead.",
        );
        return;
      }

      setImportingImage(true);
      try {
        const frame = frames[activeIndexRef.current] ?? frames[0];
        const result = await importImageFileToMosaic(
          file,
          orientationRef.current,
          frame.settings,
        );
        pushUndoCheckpoint();
        updateActiveFrame((current) => applyImageImport(current, result));
        setToast("Image imported");
      } catch {
        setImportErrorMessage(
          "This image could not be loaded. Try JPEG, PNG, WebP, GIF, or AVIF instead.",
        );
      } finally {
        setImportingImage(false);
      }
    },
    [frames, pushUndoCheckpoint, updateActiveFrame],
  );

  const handleTextureOverlayUpload = useCallback(
    async (file: File) => {
      try {
        validateImageFile(file);
      } catch (error) {
        if (error instanceof UnsupportedImageTypeError) {
          setImportErrorMessage(unsupportedImageMessage(error.label));
          return;
        }
        setImportErrorMessage(
          "This file could not be imported. Use JPEG, PNG, WebP, GIF, or AVIF instead.",
        );
        return;
      }

      setUploadingTextureOverlay(true);
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        await ensureCachedSourceImage(dataUrl);
        pushUndoCheckpoint();
        updateActiveFrame((current) => ({
          ...current,
          textureOverlay: { dataUrl },
        }));
        setToast("Texture uploaded");
      } catch {
        setImportErrorMessage(
          "This image could not be loaded. Try JPEG, PNG, WebP, GIF, or AVIF instead.",
        );
      } finally {
        setUploadingTextureOverlay(false);
      }
    },
    [pushUndoCheckpoint, updateActiveFrame],
  );

  const handleTextureOverlayClear = useCallback(() => {
    pushUndoCheckpoint();
    updateActiveFrame((current) => ({
      ...current,
      textureOverlay: undefined,
    }));
    setToast("Texture cleared");
  }, [pushUndoCheckpoint, updateActiveFrame]);

  const handleResetCanvas = useCallback(() => {
    pushUndoCheckpoint();
    if (layoutRegenTimer.current) {
      window.clearTimeout(layoutRegenTimer.current);
      layoutRegenTimer.current = null;
    }

    const { orientation: defaultOrientation, frames: defaultFrames } =
      createDefaultCanvas();

    setOrientation(defaultOrientation);
    orientationRef.current = defaultOrientation;
    setFrames(defaultFrames);
    setActiveIndex(0);
    setPlaying(false);
    setExportPreset("1080p");
    setViewOriginal(false);
    setInspecting(false);

    if (getFullscreenElement() === appRef.current) {
      void exitAppFullscreen();
    }

    setToast("Canvas reset");
  }, [pushUndoCheckpoint]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % frames.length);
    }, 1000 / DEFAULT_FPS);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  const togglePlay = useCallback(() => {
    setPlaying((value) => !value);
  }, []);

  const toggleInspect = useCallback(() => {
    if (isFullscreen) return;
    if (orientation !== "portrait") {
      handleOrientationChange("portrait");
      setInspecting(true);
      return;
    }
    setInspecting((value) => !value);
  }, [handleOrientationChange, isFullscreen, orientation]);

  const toggleFullscreen = useCallback(() => {
    const app = appRef.current;
    if (getFullscreenElement() === app) {
      void exitAppFullscreen();
      return;
    }
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }
    setInspecting(false);
    setIsFullscreen(true);
    if (!app) return;
    void requestAppFullscreen(app).catch(() => {});
  }, [isFullscreen]);

  useEffect(() => {
    if (orientation !== "portrait") setInspecting(false);
  }, [orientation]);

  useEffect(() => {
    if (isFullscreen) setInspecting(false);
  }, [isFullscreen]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(getFullscreenElement() === appRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
    };
  }, []);

  const stepFrame = useCallback((delta: -1 | 1) => {
    setActiveIndex(
      (index) => (index + delta + frames.length) % frames.length,
    );
  }, [frames.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.code === "KeyY") {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Escape" && inspectingRef.current) {
        event.preventDefault();
        setInspecting(false);
        return;
      }

      const key = event.key.toLowerCase();
      if (event.code === "KeyF" || key === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (event.code === "Space" || key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "ArrowLeft" || key === "arrowleft") {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.code === "ArrowRight" || key === "arrowright") {
        event.preventDefault();
        stepFrame(1);
      } else if (event.code === "KeyO" || key === "o") {
        const frame = frames[activeIndexRef.current] ?? frames[0];
        if (frame?.imageSource) {
          event.preventDefault();
          setViewOriginal((current) => !current);
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [toggleFullscreen, togglePlay, stepFrame, frames, undo, redo]);

  return (
    <div
      ref={appRef}
      className={["app", isFullscreen ? "is-fullscreen" : ""].filter(Boolean).join(" ")}
    >
      {toast && !isFullscreen ? <div className="app-toast">{toast}</div> : null}
      {importErrorMessage ? (
        <ImportErrorDialog
          message={importErrorMessage}
          onDismiss={() => setImportErrorMessage(null)}
        />
      ) : null}
      {!isFullscreen ? (
      <ControlsPanel
        frame={activeFrame}
        orientation={orientation}
        exportPreset={exportPreset}
        onSettingsChange={handleSettingsChange}
        onRandomizeLayout={randomizeLayout}
        onRandomizeAll={randomizeAll}
        onCopySettings={() => void handleCopySettings()}
        onPasteSettings={() => void handlePasteSettings()}
        canPasteSettings={canPasteSettings}
        onRandomizeCurrentColors={() => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) => randomizeFrameCurrentColors(frame));
        }}
        onRandomizeNewColors={() => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) => randomizeFrameNewColors(frame));
        }}
        onAddColor={() => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) =>
            randomizeFrameCurrentColors({
              ...frame,
              settings: addColorToSettings(frame.settings),
            }),
          );
        }}
        onRemoveColor={(index) => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) => removeColorFromFrame(frame, index));
        }}
        onColorChange={(index, hex) => {
          pushUndoCheckpoint(true);
          updateActiveFrame((frame) => ({
            ...frame,
            settings: {
              ...frame.settings,
              colors: frame.settings.colors.map((color, i) =>
                i === index ? hex : color,
              ),
            },
            blocks: frame.blocks.map((block) =>
              block.color === frame.settings.colors[index]
                ? { ...block, color: hex }
                : block,
            ),
          }));
        }}
        onToggleColorLock={(index) => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) => {
            const colorsLocked = colorsLockedForSettings(frame.settings).map(
              (value, i) => (i === index ? !value : value),
            );
            return {
              ...frame,
              settings: { ...frame.settings, colorsLocked },
            };
          });
        }}
        onColorAmountChange={(index, amount) => {
          pushUndoCheckpoint(true);
          updateActiveFrame((frame) => {
            const colorAmounts = colorAmountsForSettings(frame.settings).map(
              (value, i) => (i === index ? amount : value),
            );
            return randomizeFrameCurrentColors({
              ...frame,
              settings: { ...frame.settings, colorAmounts },
            });
          });
        }}
        onOrientationChange={handleOrientationChange}
        inspecting={inspecting}
        onToggleInspect={toggleInspect}
        onExportPresetChange={setExportPreset}
        onExportPngFrame={() =>
          void runExport(() =>
            exportCurrentFrame(activeFrame, orientation, exportPreset),
          )
        }
        onExportPngTransparent={() =>
          void runExport(() =>
            exportCurrentFrameTransparent(
              activeFrame,
              orientation,
              exportPreset,
            ),
          )
        }
        onExportPngSequence={() =>
          void runExport(() =>
            exportAllFrames(frames, orientation, exportPreset),
          )
        }
        onExportSvgFrame={() =>
          void runExport(() => {
            exportCurrentFrameSvg(activeFrame, orientation, exportPreset);
          })
        }
        onImportImage={(file) => void handleImportImage(file)}
        importingImage={importingImage}
        onTextureOverlayUpload={(file) => void handleTextureOverlayUpload(file)}
        onTextureOverlayClear={handleTextureOverlayClear}
        uploadingTextureOverlay={uploadingTextureOverlay}
        onResetCanvas={handleResetCanvas}
      />
      ) : null}

      <main className={["workspace", isFullscreen ? "is-fullscreen" : ""].filter(Boolean).join(" ")}>
        <CanvasView
          frame={activeFrame}
          orientation={orientation}
          viewOriginal={viewOriginal}
          isFullscreen={isFullscreen}
          isInspecting={inspecting}
          onToggleFullscreen={toggleFullscreen}
          onToggleInspect={toggleInspect}
        />
        {!isFullscreen ? (
        <Timeline
          frames={frames}
          activeIndex={activeIndex}
          orientation={orientation}
          playing={playing}
          onSelect={setActiveIndex}
          onReorder={handleReorderFrames}
          onAdd={handleAddFrame}
          onDuplicateCurrent={handleDuplicateCurrent}
          onRemove={handleRemoveFrame}
          canAddFrame={frames.length < MAX_FRAMES}
          onTogglePlay={togglePlay}
        />
        ) : null}
      </main>
    </div>
  );
}
