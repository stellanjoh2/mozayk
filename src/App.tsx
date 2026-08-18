import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyPaletteToClipboard } from "./colorMath";
import {
  GIF_FRAME_DELAY_CS_DEFAULT,
  MAX_VIDEO_DURATION_S,
  PLAYBACK_FPS_DEFAULT,
  clampGifFrameDelayCs,
  clampMp4ExportPreset,
  gifFrameDelayCsForPlaybackFps,
  getPreviewSize,
  playbackDelayMs,
  type ExportPreset,
  type GifExportPreset,
  type VideoImportFps,
} from "./config";
import { CanvasView, Timeline } from "./components/CanvasView";
import { ControlsPanel, MAX_FRAMES } from "./components/ControlsPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ImportErrorDialog } from "./components/ImportErrorDialog";
import { MobileGate } from "./components/MobileGate";
import { ResetCanvasDialog } from "./components/ResetCanvasDialog";
import { VideoImportDialog } from "./components/VideoImportDialog";
import { VideoImportOverlay } from "./components/VideoImportOverlay";
import { exportGif, gifExportToast } from "./export/exportGif";
import { exportMp4, mp4ExportToast } from "./export/exportMp4";
import { downloadBlob } from "./export/downloadBlob";
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
  applyLookToFrame,
  cloneFrameLook,
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
  relayoutFrameToOrientation,
  reorderFrames,
  randomizeFrameCurrentColors,
  randomizeFrameNewColors,
  applyPalettePresetToFrame,
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
  importVideoFileToMosaic,
  probeVideoFile,
  videoImportMaxFrames,
  type VideoProbe,
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
import {
  clearDraft,
  readDraftJson,
  writeDraftJson,
} from "./project/draftStore";
import {
  defaultMzkFileName,
  parseMzkProject,
  readMzkFile,
  serializeMzkProject,
  type MzkProject,
} from "./project/mzkFormat";
import type { Frame, FrameSettings, Orientation } from "./types";

import "./App.css";

const LAYOUT_REGEN_MS = 280;
/** Idle gap after which continuous edits (sliders) become a new undo step. */
const UNDO_COALESCE_MS = 400;
/** Idle gap before writing the in-memory project to IndexedDB. */
const AUTOSAVE_MS = 400;
const MOBILE_GATE_MQ = "(max-width: 900px)";

function useMobileGate(): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(MOBILE_GATE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_GATE_MQ);
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
  const isMobileGate = useMobileGate();
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [frames, setFrames] = useState<Frame[]>(() => [
    createInitialFrame("landscape"),
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>("1080p");
  const [mp4Preset, setMp4Preset] = useState<ExportPreset>("1080p");
  const [gifPreset, setGifPreset] = useState<GifExportPreset>("480p");
  const [gifFrameDelayCs, setGifFrameDelayCs] = useState(GIF_FRAME_DELAY_CS_DEFAULT);
  const [playbackFps, setPlaybackFps] = useState(PLAYBACK_FPS_DEFAULT);
  const [importingImage, setImportingImage] = useState(false);
  const [importingLabel, setImportingLabel] = useState<string | null>(null);
  const [exportingLabel, setExportingLabel] = useState<string | null>(null);
  const [videoImportDialog, setVideoImportDialog] = useState<{
    file: File;
    probe: VideoProbe;
  } | null>(null);
  const [uploadingBackgroundImage, setUploadingBackgroundImage] =
    useState(false);
  const [uploadingTextureOverlay, setUploadingTextureOverlay] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(
    null,
  );
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<MzkProject | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [viewOriginal, setViewOriginal] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const inspectingRef = useRef(inspecting);
  const [workingCanvasSize, setWorkingCanvasSize] = useState<
    readonly [number, number]
  >(() => getPreviewSize("landscape"));
  const [toast, setToast] = useState<string | null>(null);
  const layoutRegenTimer = useRef<number | null>(null);
  const shapeRerollTimer = useRef<number | null>(null);
  const flushLayoutRegenRef = useRef<(() => void) | null>(null);
  const flushShapeRerollRef = useRef<(() => void) | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const orientationRef = useRef(orientation);
  const framesRef = useRef(frames);
  const undoStackRef = useRef<CanvasSnapshot[]>([]);
  const redoStackRef = useRef<CanvasSnapshot[]>([]);
  const applyingHistoryRef = useRef(false);
  const undoCoalesceArmedRef = useRef(false);
  const undoCoalesceTimer = useRef<number | null>(null);
  const styleLookRef = useRef<Frame | null>(null);
  const [canPasteStyle, setCanPasteStyle] = useState(false);
  const exportPresetRef = useRef(exportPreset);
  const mp4PresetRef = useRef(mp4Preset);
  const gifPresetRef = useRef(gifPreset);
  const gifFrameDelayCsRef = useRef(gifFrameDelayCs);
  const playbackFpsRef = useRef(playbackFps);
  const pendingDraftRef = useRef(pendingDraft);
  const draftCheckedRef = useRef(draftChecked);
  const lastWrittenJsonRef = useRef<string | null>(null);
  const importingImageRef = useRef(importingImage);
  const loadingProjectRef = useRef(loadingProject);

  activeIndexRef.current = activeIndex;
  orientationRef.current = orientation;
  framesRef.current = frames;
  inspectingRef.current = inspecting;
  exportPresetRef.current = exportPreset;
  mp4PresetRef.current = mp4Preset;
  gifPresetRef.current = gifPreset;
  gifFrameDelayCsRef.current = gifFrameDelayCs;
  playbackFpsRef.current = playbackFps;
  pendingDraftRef.current = pendingDraft;
  draftCheckedRef.current = draftChecked;
  importingImageRef.current = importingImage;
  loadingProjectRef.current = loadingProject;

  const currentProject = useCallback((): MzkProject => ({
    orientation: orientationRef.current,
    frames: framesRef.current,
    activeIndex: activeIndexRef.current,
    exportPreset: exportPresetRef.current,
    mp4Preset: mp4PresetRef.current,
    gifPreset: gifPresetRef.current,
    gifFrameDelayCs: gifFrameDelayCsRef.current,
    playbackFps: playbackFpsRef.current,
  }), []);

  const writeDraftNow = useCallback(() => {
    if (!draftCheckedRef.current || pendingDraftRef.current) return;
    if (importingImageRef.current || loadingProjectRef.current) return;
    const json = serializeMzkProject(currentProject());
    if (json === lastWrittenJsonRef.current) return;
    lastWrittenJsonRef.current = json;
    void writeDraftJson(json).catch(() => {});
  }, [currentProject]);

  const handleWorkingCanvasSize = useCallback(
    (width: number, height: number) => {
      setWorkingCanvasSize((prev) =>
        prev[0] === width && prev[1] === height ? prev : [width, height],
      );
    },
    [],
  );

  const activeFrame = frames[activeIndex] ?? frames[0];
  const canvasOrientation = isMobileGate ? "portrait" : orientation;
  const canvasFrame = useMemo(() => {
    if (!isMobileGate || orientation !== "landscape") return activeFrame;
    return transposeFrameBlocks(activeFrame, "landscape", "portrait");
  }, [isMobileGate, orientation, activeFrame]);

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
    if (shapeRerollTimer.current) {
      window.clearTimeout(shapeRerollTimer.current);
      shapeRerollTimer.current = null;
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

  const applyProject = useCallback(
    async (project: MzkProject, toastMessage: string) => {
      const dataUrls = new Set<string>();
      for (const frame of project.frames) {
        if (frame.imageSource?.dataUrl) dataUrls.add(frame.imageSource.dataUrl);
        if (frame.textureOverlay?.dataUrl) {
          dataUrls.add(frame.textureOverlay.dataUrl);
        }
        if (frame.backgroundImage?.dataUrl) {
          dataUrls.add(frame.backgroundImage.dataUrl);
        }
      }
      await Promise.all(
        [...dataUrls].map((dataUrl) => ensureCachedSourceImage(dataUrl)),
      );

      pushUndoCheckpoint();
      if (layoutRegenTimer.current) {
        window.clearTimeout(layoutRegenTimer.current);
        layoutRegenTimer.current = null;
      }
      if (shapeRerollTimer.current) {
        window.clearTimeout(shapeRerollTimer.current);
        shapeRerollTimer.current = null;
      }

      const mp4PresetValue = clampMp4ExportPreset(
        project.orientation,
        project.mp4Preset,
      );
      setOrientation(project.orientation);
      orientationRef.current = project.orientation;
      setFrames(project.frames);
      framesRef.current = project.frames;
      setActiveIndex(project.activeIndex);
      activeIndexRef.current = project.activeIndex;
      setExportPreset(project.exportPreset);
      exportPresetRef.current = project.exportPreset;
      setMp4Preset(mp4PresetValue);
      mp4PresetRef.current = mp4PresetValue;
      setGifPreset(project.gifPreset);
      gifPresetRef.current = project.gifPreset;
      setGifFrameDelayCs(project.gifFrameDelayCs);
      gifFrameDelayCsRef.current = project.gifFrameDelayCs;
      setPlaybackFps(project.playbackFps);
      playbackFpsRef.current = project.playbackFps;
      setPlaying(false);
      setViewOriginal(false);
      setInspecting(false);
      setToast(toastMessage);
    },
    [pushUndoCheckpoint],
  );

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

  const randomizeCurrentColors = useCallback(() => {
    pushUndoCheckpoint();
    updateActiveFrame((frame) => randomizeFrameCurrentColors(frame));
  }, [pushUndoCheckpoint, updateActiveFrame]);

  const scheduleLayoutRegen = useCallback(() => {
    if (layoutRegenTimer.current) return;
    layoutRegenTimer.current = window.setTimeout(() => {
      layoutRegenTimer.current = null;
      regenerateLayout();
    }, LAYOUT_REGEN_MS);
  }, [regenerateLayout]);

  const flushLayoutRegen = useCallback(() => {
    if (!layoutRegenTimer.current) return;
    window.clearTimeout(layoutRegenTimer.current);
    layoutRegenTimer.current = null;
    regenerateLayout();
  }, [regenerateLayout]);

  const scheduleShapeReroll = useCallback(() => {
    if (shapeRerollTimer.current) return;
    shapeRerollTimer.current = window.setTimeout(() => {
      shapeRerollTimer.current = null;
      updateActiveFrame((frame) => ({
        ...frame,
        blocks: rerollShapes(frame.blocks, frame.settings),
      }));
    }, LAYOUT_REGEN_MS);
  }, [updateActiveFrame]);

  const flushShapeReroll = useCallback(() => {
    if (!shapeRerollTimer.current) return;
    window.clearTimeout(shapeRerollTimer.current);
    shapeRerollTimer.current = null;
    updateActiveFrame((frame) => ({
      ...frame,
      blocks: rerollShapes(frame.blocks, frame.settings),
    }));
  }, [updateActiveFrame]);

  flushLayoutRegenRef.current = flushLayoutRegen;
  flushShapeRerollRef.current = flushShapeReroll;

  useEffect(() => {
    const onPointerUp = () => {
      flushLayoutRegenRef.current?.();
      flushShapeRerollRef.current?.();
    };
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, []);

  useEffect(
    () => () => {
      if (layoutRegenTimer.current) {
        window.clearTimeout(layoutRegenTimer.current);
      }
      if (shapeRerollTimer.current) {
        window.clearTimeout(shapeRerollTimer.current);
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
        if (rerollsShape && !needsLayout && !("shapeMix" in patch)) {
          if (shapeRerollTimer.current) {
            window.clearTimeout(shapeRerollTimer.current);
            shapeRerollTimer.current = null;
          }
          blocks = rerollShapes(blocks, nextSettings);
        }

        return { ...frame, settings: nextSettings, blocks };
      });

      if (needsLayout) {
        scheduleLayoutRegen();
      } else if ("shapeMix" in patch) {
        scheduleShapeReroll();
      }
    },
    [
      mergeSettings,
      pushUndoCheckpoint,
      scheduleLayoutRegen,
      scheduleShapeReroll,
      updateActiveFrame,
    ],
  );

  const handleOrientationChange = useCallback(
    (next: Orientation) => {
      if (next === orientation) return;
      pushUndoCheckpoint();
      setOrientation(next);
      orientationRef.current = next;
      setMp4Preset((preset) => clampMp4ExportPreset(next, preset));
      setFrames((prev) =>
        prev.map((frame) =>
          relayoutFrameToOrientation(frame, orientation, next),
        ),
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

  const handleDuplicateCurrent = useCallback((index: number) => {
    if (framesRef.current.length >= MAX_FRAMES) return;
    pushUndoCheckpoint();
    setFrames((prev) => {
      if (prev.length >= MAX_FRAMES) return prev;
      const sourceIndex = Math.min(Math.max(0, index), prev.length - 1);
      const source = prev[sourceIndex] ?? prev[0];
      const copy = duplicateFrame(source);
      const insertAt = sourceIndex + 1;
      const next = [...prev.slice(0, insertAt), copy, ...prev.slice(insertAt)];
      setActiveIndex(insertAt);
      return next;
    });
  }, [pushUndoCheckpoint]);

  const handleRemoveFrame = useCallback((index: number) => {
    if (framesRef.current.length <= 1) return;
    pushUndoCheckpoint();
    setFrames((prev) => {
      if (prev.length <= 1) return prev;
      const removeIndex = Math.min(Math.max(0, index), prev.length - 1);
      const next = prev.filter((_, frameIndex) => frameIndex !== removeIndex);
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

  const handleMoveBlock = useCallback(
    (blockIndex: number, toCol: number, toRow: number) => {
      pushUndoCheckpoint();
      updateActiveFrame((frame) => ({
        ...frame,
        blocks: frame.blocks.map((block, index) =>
          index === blockIndex ? { ...block, col: toCol, row: toRow } : block,
        ),
      }));
    },
    [pushUndoCheckpoint, updateActiveFrame],
  );

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

  const handleCopyPalette = useCallback(async () => {
    const copied = await copyPaletteToClipboard(activeFrame.settings.colors);
    setToast(copied ? "Palette copied" : "Could not copy palette");
  }, [activeFrame.settings.colors]);

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

  const handleCopyStyle = useCallback((index: number) => {
    const frame = framesRef.current[index];
    if (!frame) return;
    styleLookRef.current = cloneFrameLook(frame);
    setCanPasteStyle(true);
    setToast("Style copied");
  }, []);

  const handlePasteStyle = useCallback(
    (index: number) => {
      const look = styleLookRef.current;
      if (!look) {
        setToast("Nothing to paste");
        return;
      }
      pushUndoCheckpoint();
      setFrames((prev) => {
        const target = prev[index];
        if (!target) return prev;
        const next = [...prev];
        next[index] = applyLookToFrame(target, look, orientationRef.current);
        return next;
      });
      setActiveIndex(index);
      setToast("Style pasted");
    },
    [pushUndoCheckpoint],
  );

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
    async (file: File, targetFps: VideoImportFps) => {
      setImportingImage(true);
      setImportingLabel("Importing…");
      try {
        const base =
          framesRef.current[activeIndexRef.current] ?? framesRef.current[0];
        const result = await importVideoFileToMosaic(file, {
          settings: base.settings,
          maxFrames: videoImportMaxFrames(targetFps, MAX_VIDEO_DURATION_S),
          maxDurationS: MAX_VIDEO_DURATION_S,
          targetFps,
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
        if (shapeRerollTimer.current) {
          window.clearTimeout(shapeRerollTimer.current);
          shapeRerollTimer.current = null;
        }
        pushUndoCheckpoint();
        setOrientation(result.orientation);
        orientationRef.current = result.orientation;
        setFrames(nextFrames);
        setActiveIndex(0);
        setPlaying(false);
        setPlaybackFps(result.playbackFps);
        setGifFrameDelayCs(
          gifFrameDelayCsForPlaybackFps(result.playbackFps),
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
        setVideoImportDialog({ file, probe });
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
    if (shapeRerollTimer.current) {
      window.clearTimeout(shapeRerollTimer.current);
      shapeRerollTimer.current = null;
    }

    const { orientation: defaultOrientation, frames: defaultFrames } =
      createDefaultCanvas();

    setOrientation(defaultOrientation);
    orientationRef.current = defaultOrientation;
    setFrames(defaultFrames);
    setActiveIndex(0);
    setPlaying(false);
    setExportPreset("1080p");
    setMp4Preset("1080p");
    setGifPreset("480p");
    setGifFrameDelayCs(GIF_FRAME_DELAY_CS_DEFAULT);
    setPlaybackFps(PLAYBACK_FPS_DEFAULT);
    setViewOriginal(false);
    setInspecting(false);

    if (getFullscreenElement() === appRef.current) {
      void exitAppFullscreen();
    }

    setToast("Canvas reset");
  }, [pushUndoCheckpoint]);

  const handleSaveProject = useCallback(() => {
    const json = serializeMzkProject(currentProject());
    downloadBlob(
      new Blob([json], { type: "application/x-mozayk-project" }),
      defaultMzkFileName(),
    );
    lastWrittenJsonRef.current = json;
    void clearDraft().catch(() => {});
    setToast("Project saved");
  }, [currentProject]);

  const handleLoadProject = useCallback(
    async (file: File) => {
      setLoadingProject(true);
      try {
        const project = await readMzkFile(file);
        await applyProject(project, "Project loaded");
      } catch (error) {
        setImportErrorMessage(
          error instanceof Error
            ? error.message
            : "This .mzk file could not be loaded.",
        );
      } finally {
        setLoadingProject(false);
      }
    },
    [applyProject],
  );

  const handleRestoreDraft = useCallback(async () => {
    if (loadingProjectRef.current) return;
    const project = pendingDraftRef.current;
    if (!project) return;
    setLoadingProject(true);
    try {
      await applyProject(project, "Session restored");
      setPendingDraft(null);
    } catch {
      setImportErrorMessage("This draft could not be restored.");
    } finally {
      setLoadingProject(false);
    }
  }, [applyProject]);

  const handleAbandonDraft = useCallback(() => {
    lastWrittenJsonRef.current = serializeMzkProject(currentProject());
    setPendingDraft(null);
    void clearDraft().catch(() => {});
  }, [currentProject]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const json = await readDraftJson();
        if (cancelled) return;
        const project = json ? parseMzkProject(json) : null;
        if (project) {
          lastWrittenJsonRef.current = json;
          setPendingDraft(project);
        } else {
          if (json) void clearDraft().catch(() => {});
          lastWrittenJsonRef.current = serializeMzkProject(currentProject());
        }
      } catch {
        if (cancelled) return;
        lastWrittenJsonRef.current = serializeMzkProject(currentProject());
      } finally {
        if (!cancelled) setDraftChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentProject]);

  useEffect(() => {
    if (!draftChecked || pendingDraft) return;
    if (importingImage || loadingProject || playing) return;

    const timer = window.setTimeout(() => {
      writeDraftNow();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [
    draftChecked,
    pendingDraft,
    playing,
    importingImage,
    loadingProject,
    frames,
    orientation,
    activeIndex,
    exportPreset,
    mp4Preset,
    gifPreset,
    gifFrameDelayCs,
    playbackFps,
    writeDraftNow,
  ]);

  useEffect(() => {
    if (!playing) return;
    writeDraftNow();
  }, [playing, writeDraftNow]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") writeDraftNow();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", writeDraftNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", writeDraftNow);
    };
  }, [writeDraftNow]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % frames.length);
    }, playbackDelayMs(playbackFps));
    return () => window.clearInterval(timer);
  }, [playing, frames.length, playbackFps]);

  const togglePlay = useCallback(() => {
    setPlaying((value) => !value);
  }, []);

  const toggleInspect = useCallback(() => {
    if (isFullscreen) return;
    setInspecting((value) => !value);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const app = appRef.current;
    if (!app) return;

    if (getFullscreenElement() === app) {
      void exitAppFullscreen();
      return;
    }

    setInspecting(false);
    void requestAppFullscreen(app);
  }, []);

  useEffect(() => {
    if (isFullscreen) setInspecting(false);
  }, [isFullscreen]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(getFullscreenElement() === appRef.current);
    };
    syncFullscreen();
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
      } else if (!mod && event.code === "KeyQ") {
        event.preventDefault();
        randomizeLayout();
      } else if (!mod && event.code === "KeyW") {
        event.preventDefault();
        randomizeAll();
      } else if (!mod && event.code === "KeyE") {
        event.preventDefault();
        randomizeCurrentColors();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [
    toggleFullscreen,
    togglePlay,
    stepFrame,
    frames,
    undo,
    redo,
    randomizeLayout,
    randomizeAll,
    randomizeCurrentColors,
  ]);

  return (
    <div
      ref={appRef}
      className={["app", isMobileGate ? "is-mobile-gate" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {isMobileGate ? <MobileGate onRandomizeAll={randomizeAll} /> : null}
      {toast && !isFullscreen && !isMobileGate ? (
        <div className="app-toast">{toast}</div>
      ) : null}
      {importingLabel || exportingLabel ? (
        <VideoImportOverlay label={importingLabel ?? exportingLabel ?? ""} />
      ) : null}
      {importErrorMessage ? (
        <ImportErrorDialog
          title={
            importErrorMessage.includes(".mzk")
              ? "Couldn't load project"
              : undefined
          }
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
        open={pendingDraft !== null && !isMobileGate && !loadingProject}
        title="Reconnect available"
        message="The last session closed before it was saved to a file, but a reconnect is still possible, allowing you to pick up where you left off. If you do not reconnect, you will lose your unsaved project."
        confirmLabel="Reconnect"
        cancelLabel="Abandon draft"
        onConfirm={() => void handleRestoreDraft()}
        onCancel={handleAbandonDraft}
      />
      <VideoImportDialog
        open={videoImportDialog !== null}
        fileName={videoImportDialog?.file.name ?? ""}
        probe={videoImportDialog?.probe ?? null}
        onCancel={() => setVideoImportDialog(null)}
        onConfirm={(targetFps) => {
          const pending = videoImportDialog;
          setVideoImportDialog(null);
          if (pending) void importVideoFile(pending.file, targetFps);
        }}
      />
      {!isFullscreen && !isMobileGate ? (
      <div className="app-chrome">
      <ControlsPanel
        frame={activeFrame}
        orientation={orientation}
        exportPreset={exportPreset}
        mp4Preset={mp4Preset}
        gifPreset={gifPreset}
        gifFrameDelayCs={gifFrameDelayCs}
        playbackFps={playbackFps}
        frameCount={frames.length}
        onSettingsChange={handleSettingsChange}
        onRandomizeLayout={randomizeLayout}
        onRandomizeAll={randomizeAll}
        onApplyLookToAllFrames={handleApplyLookToAllFrames}
        onCopySettings={() => void handleCopySettings()}
        onPasteSettings={() => void handlePasteSettings()}
        onCopyPalette={() => void handleCopyPalette()}
        onRandomizeCurrentColors={randomizeCurrentColors}
        onRandomizeNewColors={() => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) => randomizeFrameNewColors(frame));
        }}
        onApplyPalettePreset={(preset) => {
          pushUndoCheckpoint();
          updateActiveFrame((frame) => applyPalettePresetToFrame(frame, preset));
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
        onMp4PresetChange={setMp4Preset}
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
        onExportMp4={() =>
          void runExport(async () => {
            setExportingLabel("Exporting…");
            try {
              const bytes = await exportMp4(
                frames,
                orientation,
                mp4Preset,
                playbackFps,
                setExportingLabel,
              );
              setToast(mp4ExportToast(bytes));
            } finally {
              setExportingLabel(null);
            }
          })
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
        onSaveProject={handleSaveProject}
        onLoadProject={(file) => void handleLoadProject(file)}
        loadingProject={loadingProject}
      />
      </div>
      ) : null}

      <main className={["workspace", isFullscreen || isMobileGate ? "is-fullscreen" : ""].filter(Boolean).join(" ")}>
        <CanvasView
          frame={canvasFrame}
          orientation={canvasOrientation}
          viewOriginal={viewOriginal}
          isFullscreen={isFullscreen || isMobileGate}
          isInspecting={inspecting}
          fillStage={isMobileGate}
          pieceEditingEnabled={!playing && !viewOriginal}
          onToggleInspect={isMobileGate ? undefined : toggleInspect}
          onMoveBlock={handleMoveBlock}
          onWorkingCanvasSize={handleWorkingCanvasSize}
        />
        {!isFullscreen && !isMobileGate ? (
        <Timeline
          frames={frames}
          activeIndex={activeIndex}
          orientation={orientation}
          playing={playing}
          playbackFps={playbackFps}
          onPlaybackFpsChange={setPlaybackFps}
          onSelect={setActiveIndex}
          onReorder={handleReorderFrames}
          onAdd={handleAddFrame}
          onDuplicate={handleDuplicateCurrent}
          onRemove={handleRemoveFrame}
          onCopyStyle={handleCopyStyle}
          onPasteStyle={handlePasteStyle}
          canPasteStyle={canPasteStyle}
          canAddFrame={frames.length < MAX_FRAMES}
          onTogglePlay={togglePlay}
        />
        ) : null}
      </main>
    </div>
  );
}
