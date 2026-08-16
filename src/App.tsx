import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GIF_FRAME_DELAY_CS_DEFAULT,
  MAX_VIDEO_DURATION_S,
  clampGifFrameDelayCs,
  getPreviewSize,
  gifDelayMs,
  type ExportPreset,
  type GifExportPreset,
} from "./config";
import { CanvasView, Timeline } from "./components/CanvasView";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ControlsPanel, MAX_FRAMES } from "./components/ControlsPanel";
import { ImportErrorDialog } from "./components/ImportErrorDialog";
import { MobileGate } from "./components/MobileGate";
import { ResetCanvasDialog } from "./components/ResetCanvasDialog";
import { VideoImportOverlay } from "./components/VideoImportOverlay";
import { exportGif, gifExportToast } from "./export/exportGif";
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
  applyLookToAllFrames,
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
  createImportedFrame,
} from "./state/frameUtils";
import {
  copySettings,
  readSettingsClipboard,
} from "./state/settingsClipboard";
import {
  captureCanvasSnapshot,
  pushSnapshot,
  type CanvasSnapshot,
} from "./state/undoHistory";
import { importImageFileToMosaic } from "./import/imageImport";
import {
  formatClipDuration,
  importVideoFileToMosaic,
  probeVideoFile,
} from "./import/videoImport";
import {
  ensureCachedSourceImage,
  readImageFileAsDataUrl,
} from "./import/imageSource";
import {
  UnsupportedImageTypeError,
  unsupportedImageMessage,
  validateImageFile,
} from "./import/supportedImageTypes";
import {
  UnsupportedVideoTypeError,
  unsupportedVideoMessage,
  validateVideoFile,
} from "./import/supportedVideoTypes";
import type { Frame, FrameSettings, Orientation } from "./types";

import "./App.css";

const LAYOUT_REGEN_MS = 280;
/** Idle gap after which continuous edits (sliders) become a new undo step. */
const UNDO_COALESCE_MS = 400;
const PORTRAIT_MOBILE_MQ = "(max-width: 767px) and (orientation: portrait)";

function usePortraitMobile(): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(PORTRAIT_MOBILE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_MOBILE_MQ);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return matches;
}

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
  const isPortraitMobile = usePortraitMobile();
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [frames, setFrames] = useState<Frame[]>(() => [
    createInitialFrame("landscape"),
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>("1080p");
  const [gifPreset, setGifPreset] = useState<GifExportPreset>("480p");
  const [gifFrameDelayCs, setGifFrameDelayCs] = useState(GIF_FRAME_DELAY_CS_DEFAULT);
  const [importingImage, setImportingImage] = useState(false);
  const [importingLabel, setImportingLabel] = useState<string | null>(null);
  const [videoWarning, setVideoWarning] = useState<{
    file: File;
    duration: number;
  } | null>(null);
  const [uploadingBackgroundImage, setUploadingBackgroundImage] =
    useState(false);
  const [uploadingTextureOverlay, setUploadingTextureOverlay] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(
    null,
  );
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [viewOriginal, setViewOriginal] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const inspectingRef = useRef(inspecting);
  const [workingCanvasSize, setWorkingCanvasSize] = useState<
    readonly [number, number]
  >(() => getPreviewSize("landscape"));
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

  const handleWorkingCanvasSize = useCallback(
    (width: number, height: number) => {
      setWorkingCanvasSize((prev) =>
        prev[0] === width && prev[1] === height ? prev : [width, height],
      );
    },
    [],
  );

  const activeFrame = frames[activeIndex] ?? frames[0];
  const canvasOrientation = isPortraitMobile ? "portrait" : orientation;
  const canvasFrame = useMemo(() => {
    if (!isPortraitMobile || orientation !== "landscape") return activeFrame;
    return transposeFrameBlocks(activeFrame, "landscape", "portrait");
  }, [isPortraitMobile, orientation, activeFrame]);

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
    await copySettings(
      activeFrame.settings,
      activeFrame.blocks,
      orientationRef.current,
    );
    setToast("Settings copied");
  }, [activeFrame.blocks, activeFrame.settings]);

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

  const handleApplyLookToAllFrames = useCallback(() => {
    if (framesRef.current.length <= 1) return;
    pushUndoCheckpoint();
    const sourceIndex = activeIndexRef.current;
    setFrames((prev) =>
      applyLookToAllFrames(prev, sourceIndex, orientationRef.current),
    );
    setToast("Look applied to all frames");
  }, [pushUndoCheckpoint]);

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

  const importVideoFile = useCallback(
    async (file: File) => {
      setImportingImage(true);
      setImportingLabel("Importing…");
      try {
        const base =
          framesRef.current[activeIndexRef.current] ?? framesRef.current[0];
        const result = await importVideoFileToMosaic(file, {
          settings: base.settings,
          maxFrames: MAX_FRAMES,
          maxDurationS: MAX_VIDEO_DURATION_S,
          onProgress: setImportingLabel,
        });
        const settings = clampSettingsForOrientation(
          base.settings,
          result.orientation,
        );
        const nextFrames = result.mosaics.map((mosaic) =>
          createImportedFrame(settings, mosaic),
        );
        if (layoutRegenTimer.current) {
          window.clearTimeout(layoutRegenTimer.current);
          layoutRegenTimer.current = null;
        }
        pushUndoCheckpoint();
        setOrientation(result.orientation);
        orientationRef.current = result.orientation;
        setFrames(nextFrames);
        setActiveIndex(0);
        setPlaying(false);
        setGifFrameDelayCs(
          clampGifFrameDelayCs(result.delayCs, nextFrames.length),
        );
        setToast(
          nextFrames.length === 1
            ? "Video imported"
            : `Imported ${nextFrames.length} frames`,
        );
      } catch {
        setImportErrorMessage(
          "This video could not be loaded. Try an MP4 or MOV clip (H.264, up to 5 seconds).",
        );
      } finally {
        setImportingImage(false);
        setImportingLabel(null);
      }
    },
    [pushUndoCheckpoint],
  );

  const handleImportVideo = useCallback(
    async (file: File) => {
      try {
        validateVideoFile(file);
      } catch (error) {
        if (error instanceof UnsupportedVideoTypeError) {
          setImportErrorMessage(unsupportedVideoMessage(error.label));
          return;
        }
        setImportErrorMessage(
          "This file could not be imported. Use an MP4 or MOV clip instead.",
        );
        return;
      }

      try {
        const probe = await probeVideoFile(file);
        if (probe.duration > MAX_VIDEO_DURATION_S + 0.05) {
          setVideoWarning({ file, duration: probe.duration });
          return;
        }
        await importVideoFile(file);
      } catch {
        setImportErrorMessage(
          "This video could not be loaded. Try an MP4 or MOV clip (H.264, up to 5 seconds).",
        );
      }
    },
    [importVideoFile],
  );

  const handleBackgroundImageUpload = useCallback(
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

      setUploadingBackgroundImage(true);
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        await ensureCachedSourceImage(dataUrl);
        pushUndoCheckpoint();
        updateActiveFrame((current) => ({
          ...current,
          backgroundImage: { dataUrl, name: file.name },
          settings: {
            ...current.settings,
            transparentBackground: false,
            showSourceImage: false,
          },
        }));
        setToast("Background uploaded");
      } catch {
        setImportErrorMessage(
          "This image could not be loaded. Try JPEG, PNG, WebP, GIF, or AVIF instead.",
        );
      } finally {
        setUploadingBackgroundImage(false);
      }
    },
    [pushUndoCheckpoint, updateActiveFrame],
  );

  const handleBackgroundImageClear = useCallback(() => {
    pushUndoCheckpoint();
    updateActiveFrame((current) => ({
      ...current,
      backgroundImage: undefined,
    }));
    setToast("Background cleared");
  }, [pushUndoCheckpoint, updateActiveFrame]);

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
    setGifPreset("480p");
    setGifFrameDelayCs(GIF_FRAME_DELAY_CS_DEFAULT);
    setViewOriginal(false);
    setInspecting(false);

    if (getFullscreenElement() === appRef.current) {
      void exitAppFullscreen();
    }

    setToast("Canvas reset");
  }, [pushUndoCheckpoint]);

  useEffect(() => {
    if (!playing) return;
    const delayMs = gifDelayMs(
      clampGifFrameDelayCs(gifFrameDelayCs, frames.length),
    );
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % frames.length);
    }, delayMs);
    return () => window.clearInterval(timer);
  }, [playing, frames.length, gifFrameDelayCs]);

  const togglePlay = useCallback(() => {
    setPlaying((value) => !value);
  }, []);

  const toggleInspect = useCallback(() => {
    if (isFullscreen) return;
    setInspecting((value) => !value);
  }, [isFullscreen]);

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
      className={["app", isFullscreen ? "is-fullscreen" : "", isPortraitMobile ? "is-portrait-mobile" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {isPortraitMobile ? <MobileGate onRandomizeAll={randomizeAll} /> : null}
      {toast && !isFullscreen && !isPortraitMobile ? (
        <div className="app-toast">{toast}</div>
      ) : null}
      {importingLabel ? (
        <VideoImportOverlay label={importingLabel} />
      ) : null}
      {importErrorMessage ? (
        <ImportErrorDialog
          message={importErrorMessage}
          onDismiss={() => setImportErrorMessage(null)}
        />
      ) : null}
      <ResetCanvasDialog
        open={resetDialogOpen}
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          handleResetCanvas();
          setResetDialogOpen(false);
        }}
      />
      <ConfirmDialog
        open={videoWarning !== null}
        title="Clip is too long"
        message={
          videoWarning
            ? `Mozayk can import up to ${MAX_VIDEO_DURATION_S} seconds. This clip is ${formatClipDuration(videoWarning.duration)}. Import the first ${MAX_VIDEO_DURATION_S} seconds?`
            : ""
        }
        confirmLabel="Import"
        onCancel={() => setVideoWarning(null)}
        onConfirm={() => {
          const pending = videoWarning;
          setVideoWarning(null);
          if (pending) void importVideoFile(pending.file);
        }}
      />
      {!isFullscreen && !isPortraitMobile ? (
      <ControlsPanel
        frame={activeFrame}
        orientation={orientation}
        exportPreset={exportPreset}
        gifPreset={gifPreset}
        gifFrameDelayCs={gifFrameDelayCs}
        frameCount={frames.length}
        onSettingsChange={handleSettingsChange}
        onRandomizeLayout={randomizeLayout}
        onRandomizeAll={randomizeAll}
        onApplyLookToAllFrames={handleApplyLookToAllFrames}
        onCopySettings={() => void handleCopySettings()}
        onPasteSettings={() => void handlePasteSettings()}
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
        onExportPresetChange={setExportPreset}
        onExportPngFrame={() =>
          void runExport(() =>
            exportCurrentFrame(
              activeFrame,
              orientation,
              exportPreset,
              activeIndex,
            ),
          )
        }
        onExportPngTransparent={() =>
          void runExport(() =>
            exportCurrentFrameTransparent(
              activeFrame,
              orientation,
              exportPreset,
              activeIndex,
            ),
          )
        }
        onExportPngSequence={() =>
          void runExport(() =>
            exportAllFrames(frames, orientation, exportPreset),
          )
        }
        onGifPresetChange={setGifPreset}
        onGifFrameDelayChange={setGifFrameDelayCs}
        onExportGif={() =>
          void runExport(async () => {
            setToast("Exporting GIF…");
            const bytes = await exportGif(
              frames,
              orientation,
              gifPreset,
              clampGifFrameDelayCs(gifFrameDelayCs, frames.length),
              workingCanvasSize,
            );
            setToast(gifExportToast(bytes));
          })
        }
        onExportSvgFrame={() =>
          void runExport(() => {
            exportCurrentFrameSvg(
              activeFrame,
              orientation,
              exportPreset,
              activeIndex,
            );
          })
        }
        onImportImage={(file) => void handleImportImage(file)}
        importingImage={importingImage}
        importingLabel={importingLabel ?? undefined}
        onImportVideo={(file) => void handleImportVideo(file)}
        onBackgroundImageUpload={(file) => void handleBackgroundImageUpload(file)}
        onBackgroundImageClear={handleBackgroundImageClear}
        uploadingBackgroundImage={uploadingBackgroundImage}
        onTextureOverlayUpload={(file) => void handleTextureOverlayUpload(file)}
        onTextureOverlayClear={handleTextureOverlayClear}
        uploadingTextureOverlay={uploadingTextureOverlay}
        onResetCanvas={() => setResetDialogOpen(true)}
      />
      ) : null}

      <main className={["workspace", isFullscreen || isPortraitMobile ? "is-fullscreen" : ""].filter(Boolean).join(" ")}>
        <CanvasView
          frame={canvasFrame}
          orientation={canvasOrientation}
          viewOriginal={viewOriginal}
          isFullscreen={isFullscreen || isPortraitMobile}
          isInspecting={inspecting}
          fillStage={isPortraitMobile}
          onToggleFullscreen={isPortraitMobile ? undefined : toggleFullscreen}
          onToggleInspect={isPortraitMobile ? undefined : toggleInspect}
          onWorkingCanvasSize={handleWorkingCanvasSize}
        />
        {!isFullscreen && !isPortraitMobile ? (
        <Timeline
          frames={frames}
          activeIndex={activeIndex}
          orientation={orientation}
          playing={playing}
          gifFrameDelayCs={gifFrameDelayCs}
          onGifFrameDelayChange={setGifFrameDelayCs}
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
