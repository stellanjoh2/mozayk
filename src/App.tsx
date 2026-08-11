import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FPS, type ExportPreset } from "./config";
import { CanvasView, Timeline } from "./components/CanvasView";
import { ControlsPanel, MAX_FRAMES } from "./components/ControlsPanel";
import { exportAllFrames, exportCurrentFrame } from "./export/exportPng";
import {
  patchNeedsLayoutRegen,
  rerollShapes,
} from "./layout/generateLayout";
import {
  addColorToSettings,
  applyDensityChange,
  applyPastedSettings,
  clampSettingsForOrientation,
  createInitialFrame,
  activeIndexAfterReorder,
  createDefaultShapePalette,
  duplicateFrame,
  regenerateFrameLayout,
  reorderFrames,
  randomizeFrameCurrentColors,
  randomizeFrameNewColors,
  randomizeFrameLayout,
  removeColorFromSettings,
  transposeFrameBlocks,
} from "./state/frameUtils";
import {
  copySettings,
  hasStoredSettings,
  readSettingsClipboard,
} from "./state/settingsClipboard";
import type { Frame, FrameSettings, Orientation } from "./types";
import "./App.css";

const LAYOUT_REGEN_MS = 280;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
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
  const [toast, setToast] = useState<string | null>(null);
  const layoutRegenTimer = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const orientationRef = useRef(orientation);

  activeIndexRef.current = activeIndex;
  orientationRef.current = orientation;

  const activeFrame = frames[activeIndex] ?? frames[0];

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
    updateActiveFrame((frame) =>
      regenerateFrameLayout(frame, orientationRef.current),
    );
  }, [updateActiveFrame]);

  const randomizeAll = useCallback(() => {
    updateActiveFrame((frame) =>
      randomizeFrameLayout(frame, orientationRef.current),
    );
  }, [updateActiveFrame]);

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
      return clampSettingsForOrientation(
        { ...settings, colors: [...frame.settings.colors] },
        orientationRef.current,
      );
    },
    [],
  );

  const handleSettingsChange = useCallback(
    (patch: Partial<FrameSettings>, immediateLayout = false) => {
      const needsLayout = patchNeedsLayoutRegen(patch);
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
    [mergeSettings, scheduleLayoutRegen, updateActiveFrame],
  );

  const handleOrientationChange = useCallback(
    (next: Orientation) => {
      if (next === orientation) return;
      setOrientation(next);
      orientationRef.current = next;
      setFrames((prev) =>
        prev.map((frame) => transposeFrameBlocks(frame, orientation, next)),
      );
    },
    [orientation],
  );

  const handleAddFrame = useCallback(() => {
    setFrames((prev) => {
      if (prev.length >= MAX_FRAMES) return prev;
      const copy = duplicateFrame(prev[prev.length - 1] ?? prev[0]);
      const next = [...prev, copy];
      setActiveIndex(next.length - 1);
      return next;
    });
  }, []);

  const handleDuplicateCurrent = useCallback(() => {
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
  }, []);

  const handleRemoveFrame = useCallback(() => {
    setFrames((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(1);
    });
    setActiveIndex((index) => Math.max(0, index - 1));
  }, []);

  const handleReorderFrames = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setFrames((prev) => reorderFrames(prev, fromIndex, toIndex));
    setActiveIndex((index) => activeIndexAfterReorder(index, fromIndex, toIndex));
  }, []);

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
    updateActiveFrame((frame) =>
      applyPastedSettings(frame, pasted, orientationRef.current),
    );
    setToast("Settings pasted");
  }, [updateActiveFrame]);

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

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value);
  }, []);

  const stepFrame = useCallback((delta: -1 | 1) => {
    setActiveIndex(
      (index) => (index + delta + frames.length) % frames.length,
    );
  }, [frames.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.code === "KeyF") {
        event.preventDefault();
        toggleFullscreen();
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen, togglePlay, stepFrame]);

  return (
    <div className={["app", isFullscreen ? "is-fullscreen" : ""].filter(Boolean).join(" ")}>
      {toast && !isFullscreen ? <div className="app-toast">{toast}</div> : null}
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
        onRandomizeCurrentColors={() =>
          updateActiveFrame((frame) => randomizeFrameCurrentColors(frame))
        }
        onRandomizeNewColors={() =>
          updateActiveFrame((frame) => randomizeFrameNewColors(frame))
        }
        onAddColor={() =>
          updateActiveFrame((frame) =>
            randomizeFrameCurrentColors({
              ...frame,
              settings: addColorToSettings(frame.settings),
            }),
          )
        }
        onRemoveColor={(index) =>
          updateActiveFrame((frame) => ({
            ...frame,
            settings: removeColorFromSettings(frame.settings, index),
          }))
        }
        onColorChange={(index, hex) =>
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
          }))
        }
        onOrientationChange={handleOrientationChange}
        onExportPresetChange={setExportPreset}
        onExportFrame={() =>
          void exportCurrentFrame(activeFrame, orientation, exportPreset)
        }
        onExportSequence={() =>
          void exportAllFrames(frames, orientation, exportPreset)
        }
      />
      ) : null}

      <main className={["workspace", isFullscreen ? "is-fullscreen" : ""].filter(Boolean).join(" ")}>
        <CanvasView
          frame={activeFrame}
          orientation={orientation}
          isFullscreen={isFullscreen}
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
