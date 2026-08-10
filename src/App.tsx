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
  clampSettingsForOrientation,
  createInitialFrame,
  duplicateFrame,
  regenerateFrameLayout,
  randomizeFrameColors,
  randomizeFrameLayout,
  removeColorFromSettings,
  transposeFrameBlocks,
} from "./state/frameUtils";
import type { Frame, FrameSettings, Orientation } from "./types";
import "./App.css";

const LAYOUT_REGEN_MS = 280;

export default function App() {
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [frames, setFrames] = useState<Frame[]>(() => [
    createInitialFrame("landscape"),
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportPreset>("1080p");
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
      let settings: FrameSettings = {
        ...frame.settings,
        scaleBlend: frame.settings.scaleBlend ?? 3,
      };
      if (patch.density !== undefined && patch.density !== settings.density) {
        settings = applyDensityChange(settings, patch.density);
        const { density: _, ...rest } = patch;
        settings = { ...settings, ...rest };
      } else {
        settings = { ...settings, ...patch };
      }
      return clampSettingsForOrientation(settings, orientationRef.current);
    },
    [],
  );

  const handleSettingsChange = useCallback(
    (patch: Partial<FrameSettings>, immediateLayout = false) => {
      const needsLayout = patchNeedsLayoutRegen(patch);
      const rerollsShape = "shapeMix" in patch;

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
          blocks = rerollShapes(blocks, nextSettings.shapeMix);
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

  const handleRemoveFrame = useCallback(() => {
    setFrames((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(1);
    });
    setActiveIndex((index) => Math.max(0, index - 1));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % frames.length);
    }, 1000 / DEFAULT_FPS);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  return (
    <div className="app">
      <ControlsPanel
        frame={activeFrame}
        orientation={orientation}
        exportPreset={exportPreset}
        onSettingsChange={handleSettingsChange}
        onRandomizeLayout={randomizeLayout}
        onRandomizeAll={randomizeAll}
        onRandomizeColors={() =>
          updateActiveFrame((frame) => randomizeFrameColors(frame))
        }
        onAddColor={() =>
          updateActiveFrame((frame) =>
            randomizeFrameColors({
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

      <main className="workspace">
        <CanvasView frame={activeFrame} orientation={orientation} />
        <Timeline
          frames={frames}
          activeIndex={activeIndex}
          orientation={orientation}
          playing={playing}
          onSelect={setActiveIndex}
          onAdd={handleAddFrame}
          onRemove={handleRemoveFrame}
          onTogglePlay={() => setPlaying((value) => !value)}
        />
      </main>
    </div>
  );
}
