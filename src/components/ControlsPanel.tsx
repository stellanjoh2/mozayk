import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  EXPORT_PRESETS,
  GIF_EXPORT_PRESETS,
  GIF_FRAME_DELAY_PRESETS,
  GIPHY_DURATION_MAX_S,
  GIPHY_DURATION_RECOMMENDED_S,
  HEAVY_BLUR_FRAME_THRESHOLD,
  MAX_COLORS,
  MAX_FRAMES,
  clampGifFrameDelayCs,
  clampMp4ExportPreset,
  getMp4ExportPresets,
  getMp4ExportSize,
  gifDurationSeconds,
  gifFpsFromDelayCs,
  type ExportPreset,
  type GifExportPreset,
} from "../config";
import {
  DENSITY_INFO,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import {
  DATA_FIELDS_COLOR_DEFAULT,
  DATA_FIELDS_SIZE_DEFAULT,
  DATA_FIELDS_SIZE_MAX,
  DATA_FIELDS_SIZE_MIN,
  DATA_FIELDS_SPAWN_DEFAULT,
  DATA_FIELDS_SPAWN_MAX,
  DATA_FIELDS_SPAWN_MIN,
  DATA_FIELDS_VALUE_TYPE_DEFAULT,
  DATA_FIELDS_VALUE_TYPE_LABELS,
  DATA_FIELDS_VALUE_TYPES,
} from "../render/dataFields";
import {
  GRID_BLEND_LABELS,
  GRID_BLEND_MODES,
  GRID_CROSS_SIZE_DEFAULT,
  GRID_CROSS_SIZE_MAX,
  GRID_CROSS_SIZE_MIN,
  GRID_OVERLAY_STROKES,
  resolveGridOverlayStroke,
} from "../render/gridOverlayParams";
import {
  TEXTURE_OVERLAY_BLEND_LABELS,
  TEXTURE_OVERLAY_BLEND_MODES,
  TEXTURE_OVERLAY_HUE_DEFAULT,
  TEXTURE_OVERLAY_OPACITY_DEFAULT,
  TEXTURE_OVERLAY_TINT_DEFAULT,
  isTextureOverlayEnabled,
} from "../render/textureOverlay";
import { isExtrasEnabled } from "../render/bonusFx";
import {
  WIREFRAME_PEEL_AMOUNT_DEFAULT,
  WIREFRAME_PEEL_STROKE_DEFAULT,
} from "../render/wireframePeel";
import {
  ORIENTATION_LABELS,
  ORIENTATIONS,
  type DataFieldsValueType,
  type Density,
  type Frame,
  type FrameSettings,
  type GridBlendMode,
  type Orientation,
  type TextureOverlayBlendMode,
} from "../types";
import { SUPPORTED_IMAGE_ACCEPT } from "../import/supportedImageTypes";
import { SUPPORTED_VIDEO_ACCEPT } from "../import/supportedVideoTypes";
import { isMzkFile, MZK_EXTENSION } from "../project/mzkFormat";
import { BrandLogo } from "./BrandLogo";
import { AboutOverlay } from "./AboutOverlay";
import { ConfirmDialog } from "./ConfirmDialog";
import { ColorSwatch } from "./ColorSwatch";
import { PalettePanel } from "./PalettePanel";
import type { PalettePreset } from "../presets/palettePresets";
import {
  RemoveIconButton,
} from "./ControlRowWithPause";
import { HeadlineDisclosure, HeadlineToggle, SliderRow, ToggleRow } from "./ControlRow";
import { HintLabel } from "./HintLabel";
import { UiSelect } from "./UiSelect";
import {
  getNormalCursor,
  setNormalCursor,
} from "../ui/cursors";
import {
  getNormalHoverEffects,
  setNormalHoverEffects,
} from "../ui/hover";
import {
  getShortcutLegendEnabled,
  setShortcutLegendEnabled,
} from "../ui/shortcutLegend";
import {
  CHROME_APPEARANCE_LABELS,
  CHROME_APPEARANCES,
  CHROME_COLOR_LABELS,
  CHROME_COLORS,
  getChromeAppearance,
  getChromeColor,
  setChromeAppearance,
  setChromeColor,
  type ChromeAppearance,
  type ChromeColor,
} from "../ui/theme";
import {
  getUiSoundsEnabled,
  getUiSoundsVolume,
  playUiSound,
  setUiSoundsEnabled,
  setUiSoundsVolume,
} from "../ui/sounds";

gsap.registerPlugin(useGSAP);

const COLOR_LIST_SHIFT_MS = 450;

const DENSITY_SELECT_OPTIONS = DENSITY_INFO.map((info) => ({
  value: String(info.level),
  label: info.label,
}));

const OVERLAY_DENSITY_SELECT_OPTIONS = DENSITY_INFO.filter(
  (info) => info.level > 0,
).map((info) => ({
  value: String(info.level),
  label: info.label,
}));

const BLEND_SELECT_OPTIONS = GRID_BLEND_MODES.map((mode) => ({
  value: mode,
  label: GRID_BLEND_LABELS[mode],
}));

const DATA_FIELDS_VALUE_SELECT_OPTIONS = DATA_FIELDS_VALUE_TYPES.map(
  (type) => ({
    value: type,
    label: DATA_FIELDS_VALUE_TYPE_LABELS[type],
  }),
);

type ControlsPanelProps = {
  frame: Frame;
  orientation: Orientation;
  exportPreset: ExportPreset;
  mp4Preset: ExportPreset;
  gifPreset: GifExportPreset;
  gifFrameDelayCs: number;
  playbackFps: number;
  frameCount: number;
  highQualityMode: boolean;
  onHighQualityModeChange: (enabled: boolean) => void;
  onSettingsChange: (patch: Partial<FrameSettings>, immediateLayout?: boolean) => void;
  onRandomizeLayout: () => void;
  onRandomizeAll: () => void;
  onApplyLookToAllFrames: () => void;
  onCopySettings: () => void;
  onPasteSettings: () => void;
  onCopyPalette: () => void;
  onRandomizeCurrentColors: () => void;
  onRandomizeNewColors: () => void;
  onApplyPalettePreset: (preset: PalettePreset) => void;
  onAddColor: () => void;
  onRemoveColor: (index: number) => void;
  onColorChange: (index: number, hex: string) => void;
  onToggleColorLock: (index: number) => void;
  onColorAmountChange: (index: number, amount: number) => void;
  onOrientationChange: (orientation: Orientation) => void;
  onExportPresetChange: (preset: ExportPreset) => void;
  onMp4PresetChange: (preset: ExportPreset) => void;
  onExportPngFrame: () => void;
  onExportPngTransparent: () => void;
  onExportPngSequence: () => void;
  onExportJpgFrame: () => void;
  onExportJpgSequence: () => void;
  onExportMp4: () => void;
  onGifPresetChange: (preset: GifExportPreset) => void;
  onGifFrameDelayChange: (delayCs: number) => void;
  onExportGif: () => void;
  onExportSvgFrame: () => void;
  onImportImage: (file: File) => void;
  importingImage?: boolean;
  importingLabel?: string;
  onImportVideo: (file: File) => void;
  onBackgroundImageUpload: (file: File) => void;
  onBackgroundImageClear: () => void;
  uploadingBackgroundImage?: boolean;
  onTextureOverlayUpload: (file: File) => void;
  onTextureOverlayClear: () => void;
  uploadingTextureOverlay?: boolean;
  onResetCanvas: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  loadingProject?: boolean;
};

type PanelTab = "create" | "export" | "settings";

/** One blur-crash FYI per tab session, even if Settings remounts. */
let highQualityModeWarned = false;

type ExportFormat = "png" | "jpg" | "mp4" | "gif" | "svg";

const EXPORT_OPEN_DEFAULT: Record<ExportFormat, boolean> = {
  png: false,
  jpg: false,
  mp4: false,
  gif: false,
  svg: false,
};

export function ControlsPanel({
  frame,
  orientation,
  exportPreset,
  mp4Preset,
  gifPreset,
  gifFrameDelayCs,
  playbackFps,
  frameCount,
  highQualityMode,
  onHighQualityModeChange,
  onSettingsChange,
  onRandomizeLayout,
  onRandomizeAll,
  onApplyLookToAllFrames,
  onCopySettings,
  onPasteSettings,
  onCopyPalette,
  onRandomizeCurrentColors,
  onRandomizeNewColors,
  onApplyPalettePreset,
  onAddColor,
  onRemoveColor,
  onColorChange,
  onToggleColorLock,
  onColorAmountChange,
  onOrientationChange,
  onExportPresetChange,
  onMp4PresetChange,
  onExportPngFrame,
  onExportPngTransparent,
  onExportPngSequence,
  onExportJpgFrame,
  onExportJpgSequence,
  onExportMp4,
  onGifPresetChange,
  onGifFrameDelayChange,
  onExportGif,
  onExportSvgFrame,
  onImportImage,
  importingImage = false,
  importingLabel,
  onImportVideo,
  onBackgroundImageUpload,
  onBackgroundImageClear,
  uploadingBackgroundImage = false,
  onTextureOverlayUpload,
  onTextureOverlayClear,
  uploadingTextureOverlay = false,
  onResetCanvas,
  onSaveProject,
  onLoadProject,
  loadingProject = false,
}: ControlsPanelProps) {
  const { settings } = frame;
  const panelRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabLineRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("create");
  const [exportOpen, setExportOpen] = useState(() => ({ ...EXPORT_OPEN_DEFAULT }));
  const [soundsOn, setSoundsOn] = useState(getUiSoundsEnabled);
  const [soundVolume, setSoundVolume] = useState(getUiSoundsVolume);
  const [normalHover, setNormalHover] = useState(getNormalHoverEffects);
  const [normalCursor, setNormalCursorOn] = useState(getNormalCursor);
  const [shortcutLegendOn, setShortcutLegendOn] = useState(
    getShortcutLegendEnabled,
  );
  const [chromeAppearance, setChromeAppearanceOn] = useState(getChromeAppearance);
  const [chromeColor, setChromeColorOn] = useState(getChromeColor);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [heavyBlurDialogOpen, setHeavyBlurDialogOpen] = useState(false);
  const [highQualityDialogOpen, setHighQualityDialogOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [themesAnimating, setThemesAnimating] = useState(false);
  const shapes = settings.shapes ?? {
    sphere: false,
    ring: false,
    triangle: false,
    cross: false,
  };
  const anyShapeActive = shapes.sphere || shapes.ring || shapes.triangle || shapes.cross;
  const textureOverlayOn = isTextureOverlayEnabled(
    settings,
    Boolean(frame.textureOverlay),
  );
  const extrasOn = isExtrasEnabled(settings);
  const toggleShape = (key: keyof typeof shapes) => {
    const next = !shapes[key];
    playUiSound(next ? "ok" : "close");
    onSettingsChange({ shapes: { ...shapes, [key]: next } });
  };
  const selectOrientation = (next: Orientation) => {
    if (next === orientation) return;
    onOrientationChange(next);
  };
  const selectChromeAppearance = (next: ChromeAppearance) => {
    if (next === chromeAppearance) return;
    setChromeAppearance(next);
    setChromeAppearanceOn(next);
  };
  const selectChromeColor = (next: ChromeColor) => {
    if (next === chromeColor) return;
    setChromeColor(next);
    setChromeColorOn(next);
  };
  const selectPanelTab = (tab: PanelTab) => {
    if (tab === panelTab) return;
    setPanelTab(tab);
    if (tab === "export") setExportOpen({ ...EXPORT_OPEN_DEFAULT });
    panelRef.current?.scrollTo({ top: 0 });
  };
  const toggleExportFormat = (format: ExportFormat) => {
    setExportOpen((prev) => ({ ...prev, [format]: !prev[format] }));
  };

  useGSAP(
    () => {
      const line = tabLineRef.current;
      if (!line) return;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      gsap.to(line, {
        xPercent:
          panelTab === "export" ? 100 : panelTab === "settings" ? 200 : 0,
        duration: reduce ? 0 : 0.5,
        ease: "power4.inOut",
        overwrite: true,
      });
    },
    { scope: tabsRef, dependencies: [panelTab] },
  );
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);
  const pendingAddColorRef = useRef(false);
  const colorRowKeysRef = useRef<string[]>([]);
  const colorKeySeqRef = useRef(0);
  const [addingColorIndex, setAddingColorIndex] = useState<number | null>(null);
  const [removingColorIndex, setRemovingColorIndex] = useState<number | null>(
    null,
  );

  const colorCount = settings.colors.length;
  const colorRowKeys = colorRowKeysRef.current;
  if (colorRowKeys.length !== colorCount) {
    if (pendingAddColorRef.current && colorCount === colorRowKeys.length + 1) {
      colorRowKeysRef.current = [`c${colorKeySeqRef.current++}`, ...colorRowKeys];
    } else if (
      removingColorIndex !== null &&
      colorCount === colorRowKeys.length - 1
    ) {
      const next = colorRowKeys.slice();
      next.splice(removingColorIndex, 1);
      colorRowKeysRef.current = next;
    } else {
      colorRowKeysRef.current = Array.from(
        { length: colorCount },
        () => `c${colorKeySeqRef.current++}`,
      );
    }
  }
  if (
    pendingAddColorRef.current &&
    colorRowKeysRef.current.length === colorCount
  ) {
    pendingAddColorRef.current = false;
  }

  const colorListBusy =
    addingColorIndex !== null || removingColorIndex !== null;

  useLayoutEffect(() => {
    if (addingColorIndex === null) return;
    const timer = window.setTimeout(
      () => setAddingColorIndex(null),
      COLOR_LIST_SHIFT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [addingColorIndex]);

  const handleAddColor = () => {
    if (settings.colors.length >= MAX_COLORS || colorListBusy) {
      return;
    }
    pendingAddColorRef.current = true;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAddingColorIndex(0);
    }
    onAddColor();
  };

  const handleRemoveColor = (index: number) => {
    if (settings.colors.length <= 1 || colorListBusy) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      colorRowKeysRef.current.splice(index, 1);
      onRemoveColor(index);
      return;
    }
    setRemovingColorIndex(index);
    window.setTimeout(() => {
      colorRowKeysRef.current.splice(index, 1);
      onRemoveColor(index);
      setRemovingColorIndex(null);
    }, COLOR_LIST_SHIFT_MS);
  };

  return (
    <>
    <PalettePanel
      open={themesOpen}
      onClose={() => setThemesOpen(false)}
      onApplyPreset={onApplyPalettePreset}
      onAnimatingChange={setThemesAnimating}
    />
    <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />
    <ConfirmDialog
      open={heavyBlurDialogOpen}
      title="Save your project"
      message="You're adding blur to a project that's already getting quite heavy. Please save now just in case."
      confirmLabel="Save"
      cancelLabel="OK"
      onConfirm={() => {
        onSaveProject();
        setHeavyBlurDialogOpen(false);
      }}
      onCancel={() => setHeavyBlurDialogOpen(false)}
    />
    <ConfirmDialog
      open={highQualityDialogOpen}
      title="Save your project"
      message="Blur during sequence playback can crash the browser. Please save now just in case."
      confirmLabel="Save"
      cancelLabel="OK"
      onConfirm={() => {
        onSaveProject();
        setHighQualityDialogOpen(false);
      }}
      onCancel={() => setHighQualityDialogOpen(false)}
    />
    <aside ref={panelRef} className="controls-panel">
      <div className="controls-panel__zoom">
      <header className="controls-panel__head">
        <BrandLogo
          className="controls-panel__logo"
          onClick={() => {
            playUiSound("ok");
            onResetCanvas();
          }}
        />
      </header>

      <div
        ref={tabsRef}
        className="controls-panel__tabs"
        role="tablist"
        aria-label="Panel"
      >
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === "create"}
          className={
            panelTab === "create"
              ? "controls-panel__tab is-active"
              : "controls-panel__tab"
          }
          onClick={() => selectPanelTab("create")}
        >
          Create
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === "export"}
          className={
            panelTab === "export"
              ? "controls-panel__tab is-active"
              : "controls-panel__tab"
          }
          onClick={() => selectPanelTab("export")}
        >
          Export
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panelTab === "settings"}
          className={
            panelTab === "settings"
              ? "controls-panel__tab is-active"
              : "controls-panel__tab"
          }
          onClick={() => selectPanelTab("settings")}
        >
          Settings
        </button>
        <span ref={tabLineRef} className="controls-panel__tab-line" aria-hidden />
      </div>

      {panelTab === "create" ? (
      <>
      <section className="panel-section">
        <h2>Canvas</h2>
        <div className="button-row button-row--4 button-row--choice">
          {ORIENTATIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={orientation === value ? "is-active" : ""}
              onClick={() => selectOrientation(value)}
            >
              {ORIENTATION_LABELS[value]}
            </button>
          ))}
        </div>
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <UiSelect
            value={settings.density}
            options={DENSITY_SELECT_OPTIONS}
            onChange={(density) =>
              onSettingsChange({ density: Number(density) as Density }, true)
            }
          />
        </label>
      </section>

      <section className="panel-section">
        <h2>Source</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          className="import-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImportImage(file);
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept={SUPPORTED_VIDEO_ACCEPT}
          className="import-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImportVideo(file);
          }}
        />
        <div className="button-row">
          <button
            type="button"
            disabled={importingImage}
            onClick={() => fileInputRef.current?.click()}
          >
            {importingImage && !importingLabel ? "Importing…" : "Import Image"}
          </button>
          <button
            type="button"
            disabled={importingImage}
            title="MP4 or MOV, up to 5 seconds"
            onClick={() => videoInputRef.current?.click()}
          >
            {importingLabel ?? "Import Video"}
          </button>
        </div>
        {frame.imageSource ? (
          <ToggleRow
            label="Show Source Image"
            hint="Reveal the photo in gaps between shapes"
            checked={Boolean(frame.settings.showSourceImage)}
            onChange={(showSourceImage) => onSettingsChange({ showSourceImage })}
          />
        ) : null}
      </section>

      <section className="panel-section">
        <h2>Layout</h2>
        <button
          type="button"
          className="panel-btn has-hint"
          data-hint="Keeps your current slider settings"
          data-shortcut="KeyQ"
          onClick={onRandomizeLayout}
        >
          Randomize Layout
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost has-hint"
          data-hint="Also randomizes all sliders"
          data-shortcut="KeyW"
          onClick={onRandomizeAll}
        >
          Randomize All
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost has-hint"
          data-hint="Copies this style · keeps each frame's picture"
          disabled={frameCount <= 1}
          onClick={onApplyLookToAllFrames}
        >
          Apply Look to All Frames
        </button>
        <p className="control-row__label control-row__label--solo">
          <HintLabel hint="Blocks always on · toggle extras to mix in">Add Shapes</HintLabel>
        </p>
        <div className="button-row button-row--4 button-row--shape-icons">
          <button
            type="button"
            aria-label="Spheres"
            aria-pressed={shapes.sphere}
            className={shapes.sphere ? "is-active" : ""}
            onClick={() => toggleShape("sphere")}
          >
            <svg className="shape-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="11" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Rings"
            aria-pressed={shapes.ring}
            className={shapes.ring ? "is-active" : ""}
            onClick={() => toggleShape("ring")}
          >
            <svg className="shape-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Triangles"
            aria-pressed={Boolean(shapes.triangle)}
            className={shapes.triangle ? "is-active" : ""}
            onClick={() => toggleShape("triangle")}
          >
            <svg className="shape-icon" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="2,2 22,2 22,22" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Crosses"
            aria-pressed={Boolean(shapes.cross)}
            className={shapes.cross ? "is-active" : ""}
            onClick={() => toggleShape("cross")}
          >
            <svg className="shape-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7V2z"
              />
            </svg>
          </button>
        </div>
        <SliderRow
          label="Shape Mix"
          hint="0 = blocks only · 100 = mix all enabled"
          value={settings.shapeMix}
          disabled={!anyShapeActive}
          onChange={(shapeMix) => onSettingsChange({ shapeMix })}
        />
        <SliderRow
          label="Ring Thickness"
          hint="0 = thin · 100 = solid · same on every ring"
          value={settings.ringThickness ?? 45}
          disabled={!shapes.ring}
          onChange={(ringThickness) => onSettingsChange({ ringThickness })}
        />
        <SliderRow
          label="Fill Amount"
          value={settings.fillAmount}
          onChange={(fillAmount) => onSettingsChange({ fillAmount })}
        />
        <SliderRow
          label="Scale Blend"
          hint="0 similar ← contrast → 6 large+small"
          value={settings.scaleBlend}
          min={0}
          max={6}
          step={1}
          onChange={(scaleBlend) => onSettingsChange({ scaleBlend })}
        />
        <SliderRow
          label="Distribution"
          hint={
            frame.imageSource
              ? "Only applies to generated layouts"
              : "Left ← even → right"
          }
          value={settings.weight}
          disabled={Boolean(frame.imageSource)}
          onChange={(weight) => onSettingsChange({ weight })}
        />
      </section>

      <section className="panel-section">
        <h2>Size</h2>
        <SliderRow
          label="Max Height"
          value={settings.maxHeight}
          min={1}
          max={heightMax}
          onChange={(maxHeight) => onSettingsChange({ maxHeight })}
        />
        <ToggleRow
          label="Random Height"
          checked={settings.randomHeight}
          onChange={(randomHeight) =>
            onSettingsChange({ randomHeight }, true)
          }
        />
        <SliderRow
          label="Max Width"
          value={settings.maxWidth}
          min={1}
          max={widthMax}
          onChange={(maxWidth) => onSettingsChange({ maxWidth })}
        />
        <ToggleRow
          label="Random Width"
          checked={settings.randomWidth}
          onChange={(randomWidth) => onSettingsChange({ randomWidth }, true)}
        />
      </section>

      <section className="panel-section">
        <h2>Colour</h2>
        <button
          type="button"
          className="panel-btn"
          data-ui-sound="ok"
          disabled={themesOpen || themesAnimating}
          onClick={() => {
            if (themesOpen || themesAnimating) return;
            setThemesOpen(true);
          }}
        >
          View Themes
        </button>
        {settings.colors.length < MAX_COLORS ? (
          <button
            type="button"
            className="panel-btn"
            data-ui-sound="ok"
            onClick={handleAddColor}
          >
            Add Colour
          </button>
        ) : null}
        <div className="color-list">
          {settings.colors.map((color, index) => (
            <div
              key={colorRowKeysRef.current[index] ?? `color-${index}`}
              className={`color-row${index === addingColorIndex ? " is-adding" : ""}${index === removingColorIndex ? " is-removing" : ""}`}
            >
              <div className="color-row__inner">
                <ColorSwatch
                  color={color}
                  locked={settings.colorsLocked?.[index] ?? false}
                  onChange={(hex) => onColorChange(index, hex)}
                  onToggleLock={() => onToggleColorLock(index)}
                  onRemove={
                    settings.colors.length > 1
                      ? () => handleRemoveColor(index)
                      : undefined
                  }
                />
                <SliderRow
                  label="Amount"
                  hint="Share of canvas for this colour"
                  value={settings.colorAmounts?.[index] ?? Math.round(100 / settings.colors.length)}
                  min={1}
                  onChange={(amount) => onColorAmountChange(index, amount)}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="panel-btn panel-btn--ghost"
          onClick={onCopyPalette}
        >
          Copy Palette to Clipboard
        </button>
        <button
          type="button"
          className="panel-btn"
          data-shortcut="KeyE"
          onClick={onRandomizeCurrentColors}
        >
          Randomize Current Colours
        </button>
        <button type="button" className="panel-btn panel-btn--ghost" onClick={onRandomizeNewColors}>
          New Random Colours
        </button>
      </section>

      <section className="panel-section">
        <h2>Background</h2>
        <div className="control-row">
          <span className="control-row__label">Colour</span>
          <ColorSwatch
            color={settings.background}
            onChange={(background) => onSettingsChange({ background }, false)}
          />
        </div>
        <ToggleRow
          label="Transparent"
          hint="Checkerboard preview · no fill in SVG"
          checked={Boolean(settings.transparentBackground)}
          onChange={(transparentBackground) =>
            onSettingsChange({ transparentBackground }, false)
          }
        />
        <input
          ref={backgroundInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          className="import-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onBackgroundImageUpload(file);
          }}
        />
        <div className="color-swatch-wrap">
          <button
            type="button"
            className="panel-btn"
            disabled={uploadingBackgroundImage}
            onClick={() => backgroundInputRef.current?.click()}
          >
            {uploadingBackgroundImage
              ? "Uploading…"
              : frame.backgroundImage
                ? frame.backgroundImage.name || "Background Image"
                : "Upload Background Image"}
          </button>
          {frame.backgroundImage ? (
            <div className="color-swatch__actions">
              <RemoveIconButton
                ariaLabel="Remove background image"
                onClick={onBackgroundImageClear}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section
        className={
          settings.gridOverlay ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineToggle
          title="Grid Overlay"
          hint="Grid drawn over the mosaic"
          checked={Boolean(settings.gridOverlay)}
          onChange={(gridOverlay) => onSettingsChange({ gridOverlay }, false)}
        >
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <UiSelect
            value={settings.gridOverlayDensity ?? 1}
            options={OVERLAY_DENSITY_SELECT_OPTIONS}
            onChange={(gridOverlayDensity) =>
              onSettingsChange(
                {
                  gridOverlayDensity: Number(gridOverlayDensity) as Density,
                },
                false,
              )
            }
          />
        </label>
        <div className="control-row">
          <span className="control-row__label">Colour</span>
          <ColorSwatch
            color={settings.gridOverlayColor ?? "#ffffff"}
            onChange={(gridOverlayColor) =>
              onSettingsChange({ gridOverlayColor }, false)
            }
          />
        </div>
        <SliderRow
          label="Stroke"
          hint="Line thickness"
          value={GRID_OVERLAY_STROKES.indexOf(
            resolveGridOverlayStroke(settings.gridOverlayStroke),
          )}
          min={0}
          max={GRID_OVERLAY_STROKES.length - 1}
          step={1}
          formatValue={(i) => `${GRID_OVERLAY_STROKES[i]}px`}
          onChange={(i) =>
            onSettingsChange(
              { gridOverlayStroke: GRID_OVERLAY_STROKES[i] },
              false,
            )
          }
        />
        <SliderRow
          label="Opacity"
          value={settings.gridOverlayOpacity ?? 100}
          min={0}
          max={100}
          onChange={(gridOverlayOpacity) =>
            onSettingsChange({ gridOverlayOpacity }, false)
          }
        />
        <SliderRow
          label="Lines Randomness"
          hint="Break the square grid into irregular paths"
          value={settings.gridOverlayChaos ?? 0}
          min={0}
          max={100}
          onChange={(gridOverlayChaos) =>
            onSettingsChange({ gridOverlayChaos }, false)
          }
        />
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="How grid strokes mix with colours underneath">
              Blend
            </HintLabel>
          </span>
          <UiSelect
            value={settings.gridOverlayBlend ?? "normal"}
            options={BLEND_SELECT_OPTIONS}
            onChange={(gridOverlayBlend) =>
              onSettingsChange(
                {
                  gridOverlayBlend: gridOverlayBlend as GridBlendMode,
                },
                false,
              )
            }
          />
        </label>
        </HeadlineToggle>
      </section>

      <section
        className={
          settings.gridCrosses ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineToggle
          title="Crosses"
          hint="Pluses on grid intersections"
          checked={Boolean(settings.gridCrosses)}
          onChange={(gridCrosses) => onSettingsChange({ gridCrosses }, false)}
        >
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <UiSelect
            value={settings.gridCrossesDensity ?? 1}
            options={OVERLAY_DENSITY_SELECT_OPTIONS}
            onChange={(gridCrossesDensity) =>
              onSettingsChange(
                {
                  gridCrossesDensity: Number(gridCrossesDensity) as Density,
                },
                false,
              )
            }
          />
        </label>
        <div className="control-row">
          <span className="control-row__label">Colour</span>
          <ColorSwatch
            color={settings.gridCrossesColor ?? "#ffffff"}
            onChange={(gridCrossesColor) =>
              onSettingsChange({ gridCrossesColor }, false)
            }
          />
        </div>
        <SliderRow
          label="Stroke"
          hint="Line thickness"
          value={GRID_OVERLAY_STROKES.indexOf(
            resolveGridOverlayStroke(settings.gridCrossesStroke),
          )}
          min={0}
          max={GRID_OVERLAY_STROKES.length - 1}
          step={1}
          formatValue={(i) => `${GRID_OVERLAY_STROKES[i]}px`}
          onChange={(i) =>
            onSettingsChange(
              { gridCrossesStroke: GRID_OVERLAY_STROKES[i] },
              false,
            )
          }
        />
        <SliderRow
          label="Size"
          hint="How far the arms extend"
          value={settings.gridCrossesSize ?? GRID_CROSS_SIZE_DEFAULT}
          min={GRID_CROSS_SIZE_MIN}
          max={GRID_CROSS_SIZE_MAX}
          formatValue={(v) => `${v}px`}
          onChange={(gridCrossesSize) =>
            onSettingsChange({ gridCrossesSize }, false)
          }
        />
        <SliderRow
          label="Opacity"
          value={settings.gridCrossesOpacity ?? 100}
          min={0}
          max={100}
          onChange={(gridCrossesOpacity) =>
            onSettingsChange({ gridCrossesOpacity }, false)
          }
        />
        <SliderRow
          label="Crosses Randomness"
          hint="Omit crosses at random"
          value={settings.gridCrossesChaos ?? 0}
          min={0}
          max={100}
          onChange={(gridCrossesChaos) =>
            onSettingsChange({ gridCrossesChaos }, false)
          }
        />
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="How crosses mix with colours underneath">
              Blend
            </HintLabel>
          </span>
          <UiSelect
            value={settings.gridCrossesBlend ?? "normal"}
            options={BLEND_SELECT_OPTIONS}
            onChange={(gridCrossesBlend) =>
              onSettingsChange(
                {
                  gridCrossesBlend: gridCrossesBlend as GridBlendMode,
                },
                false,
              )
            }
          />
        </label>
        </HeadlineToggle>
      </section>

      <section
        className={
          settings.dataFields ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineToggle
          title="Data Fields"
          hint="Sparse monospace labels in cell corners · PNG only"
          checked={Boolean(settings.dataFields)}
          onChange={(dataFields) => onSettingsChange({ dataFields }, false)}
        >
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="Grid coords, serial index, or random numbers">
              Value type
            </HintLabel>
          </span>
          <UiSelect
            value={
              settings.dataFieldsValueType ?? DATA_FIELDS_VALUE_TYPE_DEFAULT
            }
            options={DATA_FIELDS_VALUE_SELECT_OPTIONS}
            onChange={(dataFieldsValueType) =>
              onSettingsChange(
                {
                  dataFieldsValueType:
                    dataFieldsValueType as DataFieldsValueType,
                },
                false,
              )
            }
          />
        </label>
        <SliderRow
          label="Spawn rate"
          hint="1 ≈ a few labels · 5 fills the sparse strips"
          value={settings.dataFieldsSpawnRate ?? DATA_FIELDS_SPAWN_DEFAULT}
          min={DATA_FIELDS_SPAWN_MIN}
          max={DATA_FIELDS_SPAWN_MAX}
          onChange={(dataFieldsSpawnRate) =>
            onSettingsChange({ dataFieldsSpawnRate }, false)
          }
        />
        <SliderRow
          label="Size"
          hint="Bitmap glyph scale · 2 ≈ 16pt (min)"
          value={settings.dataFieldsSize ?? DATA_FIELDS_SIZE_DEFAULT}
          min={DATA_FIELDS_SIZE_MIN}
          max={DATA_FIELDS_SIZE_MAX}
          formatValue={(v) => `${v}×`}
          onChange={(dataFieldsSize) =>
            onSettingsChange({ dataFieldsSize }, false)
          }
        />
        <div className="control-row">
          <span className="control-row__label">Colour</span>
          <ColorSwatch
            color={settings.dataFieldsColor ?? DATA_FIELDS_COLOR_DEFAULT}
            onChange={(dataFieldsColor) =>
              onSettingsChange({ dataFieldsColor }, false)
            }
          />
        </div>
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="How labels mix with colours underneath">
              Blend
            </HintLabel>
          </span>
          <UiSelect
            value={settings.dataFieldsBlend ?? "normal"}
            options={BLEND_SELECT_OPTIONS}
            onChange={(dataFieldsBlend) =>
              onSettingsChange(
                {
                  dataFieldsBlend: dataFieldsBlend as GridBlendMode,
                },
                false,
              )
            }
          />
        </label>
        </HeadlineToggle>
      </section>

      <section
        className={settings.gridBlur ? "panel-section" : "panel-section is-off"}
      >
        <HeadlineToggle
          title="Grid Blur"
          hint={
            highQualityMode
              ? "Gaussian blur over the finished mosaic"
              : "Gaussian blur over the finished mosaic · skipped during playback"
          }
          checked={Boolean(settings.gridBlur)}
          onChange={(gridBlur) => {
            onSettingsChange({ gridBlur }, false);
            if (
              gridBlur &&
              !settings.gridBlur &&
              frameCount >= HEAVY_BLUR_FRAME_THRESHOLD
            ) {
              setHeavyBlurDialogOpen(true);
            }
          }}
        >
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <UiSelect
            value={settings.gridBlurDensity ?? (settings.density || 1)}
            options={OVERLAY_DENSITY_SELECT_OPTIONS}
            onChange={(gridBlurDensity) =>
              onSettingsChange(
                {
                  gridBlurDensity: Number(gridBlurDensity) as Density,
                },
                false,
              )
            }
          />
        </label>
        <SliderRow
          label="Amount"
          hint="Radius relative to cell size"
          value={settings.gridBlurAmount ?? 50}
          min={0}
          max={100}
          onChange={(gridBlurAmount) =>
            onSettingsChange({ gridBlurAmount }, false)
          }
        />
        <SliderRow
          label="Blur Randomness"
          hint="Break uniform blur into irregular on-grid patches"
          value={settings.gridBlurChaos ?? 50}
          min={0}
          max={100}
          onChange={(gridBlurChaos) =>
            onSettingsChange({ gridBlurChaos }, false)
          }
        />
        </HeadlineToggle>
      </section>

      <section
        className={
          textureOverlayOn ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineToggle
          title="Texture Overlay"
          hint="Image blended over the finished mosaic · PNG only"
          checked={textureOverlayOn}
          onChange={(textureOverlayEnabled) =>
            onSettingsChange({ textureOverlayEnabled }, false)
          }
        >
        <input
          ref={textureInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_ACCEPT}
          className="import-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onTextureOverlayUpload(file);
          }}
        />
        <button
          type="button"
          className="panel-btn"
          disabled={uploadingTextureOverlay}
          onClick={() => textureInputRef.current?.click()}
        >
          {uploadingTextureOverlay
            ? "Uploading…"
            : frame.textureOverlay
              ? "Replace Texture"
              : "Upload Texture"}
        </button>
        {frame.textureOverlay ? (
          <>
            <button
              type="button"
              className="panel-btn panel-btn--ghost"
              onClick={onTextureOverlayClear}
            >
              Clear Texture
            </button>
            <label className="control-row">
              <span className="control-row__label">
                <HintLabel hint="How the texture mixes with the mosaic · PNG only">
                  Blend
                </HintLabel>
              </span>
              <UiSelect
                value={settings.textureOverlayBlend ?? "multiply"}
                options={TEXTURE_OVERLAY_BLEND_MODES.map((mode) => ({
                  value: mode,
                  label: TEXTURE_OVERLAY_BLEND_LABELS[mode],
                }))}
                onChange={(textureOverlayBlend) =>
                  onSettingsChange(
                    {
                      textureOverlayBlend:
                        textureOverlayBlend as TextureOverlayBlendMode,
                    },
                    false,
                  )
                }
              />
            </label>
            <SliderRow
              label="Opacity"
              hint="Strength of the texture overlay · PNG only"
              value={
                settings.textureOverlayOpacity ?? TEXTURE_OVERLAY_OPACITY_DEFAULT
              }
              min={0}
              max={100}
              onChange={(textureOverlayOpacity) =>
                onSettingsChange({ textureOverlayOpacity }, false)
              }
            />
            <SliderRow
              label="Hue"
              hint="Rotate colours of this texture only · PNG only"
              value={settings.textureOverlayHue ?? TEXTURE_OVERLAY_HUE_DEFAULT}
              min={-180}
              max={180}
              formatValue={(v) => `${v}°`}
              onChange={(textureOverlayHue) =>
                onSettingsChange({ textureOverlayHue }, false)
              }
            />
            <div className="control-row">
              <span className="control-row__label">
                <HintLabel hint="Multiply tint on the texture before blending · white leaves it unchanged">
                  Tint
                </HintLabel>
              </span>
              <ColorSwatch
                color={
                  settings.textureOverlayTint ?? TEXTURE_OVERLAY_TINT_DEFAULT
                }
                onChange={(textureOverlayTint) =>
                  onSettingsChange({ textureOverlayTint }, false)
                }
              />
            </div>
          </>
        ) : null}
        </HeadlineToggle>
      </section>

      <section
        className={extrasOn ? "panel-section" : "panel-section is-off"}
      >
        <HeadlineToggle
          title="Extras"
          hint="Noise, colour grade, gaps, and outlines"
          checked={extrasOn}
          onChange={(extrasEnabled) =>
            onSettingsChange({ extrasEnabled }, false)
          }
        >
        <SliderRow
          label="Noise"
          hint="Film grain over the finished image · PNG only"
          value={settings.noiseAmount ?? 0}
          min={0}
          max={100}
          onChange={(noiseAmount) =>
            onSettingsChange({ noiseAmount }, false)
          }
        />
        <SliderRow
          label="Master Hue"
          hint="Rotate colours of the finished image · PNG only"
          value={settings.hueShift ?? 0}
          min={-180}
          max={180}
          formatValue={(v) => `${v}°`}
          onChange={(hueShift) => onSettingsChange({ hueShift }, false)}
        />
        <SliderRow
          label="Contrast"
          hint="Boost or flatten tonal range · PNG only"
          value={settings.contrast ?? 0}
          min={-100}
          max={100}
          onChange={(contrast) => onSettingsChange({ contrast }, false)}
        />
        <SliderRow
          label="Brightness"
          hint="Lighten or darken the finished image · PNG only"
          value={settings.brightness ?? 0}
          min={-100}
          max={100}
          onChange={(brightness) => onSettingsChange({ brightness }, false)}
        />
        <SliderRow
          label="Corner radius"
          hint="0 = square · 100 = pill · boxes only"
          value={settings.cornerRadius ?? 0}
          onChange={(cornerRadius) =>
            onSettingsChange({ cornerRadius }, false)
          }
        />
        <SliderRow
          label="Gap"
          hint="0 = flush · 100 = uniform cell inset"
          value={settings.shapeGap ?? 0}
          onChange={(shapeGap) => onSettingsChange({ shapeGap }, false)}
        />
        <ToggleRow
          label="Wireframe peel"
          hint="Smallest shapes become outlines"
          checked={Boolean(settings.wireframePeel)}
          onChange={(wireframePeel) =>
            onSettingsChange({ wireframePeel }, false)
          }
        />
        {settings.wireframePeel ? (
          <>
            <SliderRow
              label="Amount"
              hint="0 = solid · 100 = all outlines · smallest first"
              value={
                settings.wireframePeelAmount ?? WIREFRAME_PEEL_AMOUNT_DEFAULT
              }
              min={0}
              max={100}
              onChange={(wireframePeelAmount) =>
                onSettingsChange({ wireframePeelAmount }, false)
              }
            />
            <SliderRow
              label="Stroke"
              hint="Outline thickness"
              value={GRID_OVERLAY_STROKES.indexOf(
                resolveGridOverlayStroke(
                  settings.wireframePeelStroke,
                  WIREFRAME_PEEL_STROKE_DEFAULT,
                ),
              )}
              min={0}
              max={GRID_OVERLAY_STROKES.length - 1}
              step={1}
              formatValue={(i) => `${GRID_OVERLAY_STROKES[i]}px`}
              onChange={(i) =>
                onSettingsChange(
                  { wireframePeelStroke: GRID_OVERLAY_STROKES[i] },
                  false,
                )
              }
            />
          </>
        ) : null}
        <ToggleRow
          label="Invert all"
          hint="Full-frame difference with white · PNG only"
          checked={Boolean(settings.invert)}
          shortcut="KeyI"
          onChange={(invert) => onSettingsChange({ invert }, false)}
        />
        </HeadlineToggle>
      </section>

      <section className="panel-section">
        <button
          type="button"
          className="panel-btn panel-btn--ghost"
          onClick={onResetCanvas}
        >
          Reset Canvas
        </button>
      </section>
      </>
      ) : panelTab === "export" ? (
      <>
      <section
        className={
          exportOpen.png ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineDisclosure
          title="PNG"
          open={exportOpen.png}
          onToggle={() => toggleExportFormat("png")}
        >
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="Preview matches display">
              Resolution
            </HintLabel>
          </span>
          <UiSelect
            value={exportPreset}
            options={Object.entries(EXPORT_PRESETS).map(([key, preset]) => ({
              value: key,
              label: preset.label,
            }))}
            onChange={(preset) =>
              onExportPresetChange(preset as ExportPreset)
            }
          />
        </label>
        <button type="button" className="panel-btn" onClick={onExportPngFrame}>
          Export PNG Frame
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost has-hint"
          data-hint="Transparent background · paused colours become holes"
          onClick={onExportPngTransparent}
        >
          Export Transparent PNG
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost"
          onClick={onExportPngSequence}
        >
          Export PNG Sequence (ZIP)
        </button>
        </HeadlineDisclosure>
      </section>

      <section
        className={
          exportOpen.jpg ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineDisclosure
          title="JPG"
          open={exportOpen.jpg}
          onToggle={() => toggleExportFormat("jpg")}
        >
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="Same sizes as PNG · no transparency">
              Resolution
            </HintLabel>
          </span>
          <UiSelect
            value={exportPreset}
            options={Object.entries(EXPORT_PRESETS).map(([key, preset]) => ({
              value: key,
              label: preset.label,
            }))}
            onChange={(preset) =>
              onExportPresetChange(preset as ExportPreset)
            }
          />
        </label>
        <button type="button" className="panel-btn" onClick={onExportJpgFrame}>
          Export JPG Frame
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost"
          onClick={onExportJpgSequence}
        >
          Export JPG Sequence (ZIP)
        </button>
        </HeadlineDisclosure>
      </section>

      <section
        className={
          exportOpen.mp4 ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineDisclosure
          title="MP4"
          open={exportOpen.mp4}
          onToggle={() => toggleExportFormat("mp4")}
        >
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel
              hint={
                orientation === "portrait"
                  ? "9:16 MP4 exports at 1080×1920 only"
                  : "Offline render size · independent of PNG export"
              }
            >
              Resolution
            </HintLabel>
          </span>
          <UiSelect
            value={clampMp4ExportPreset(orientation, mp4Preset)}
            disabled={orientation === "portrait"}
            options={getMp4ExportPresets(orientation).map((key) => ({
              value: key,
              label: EXPORT_PRESETS[key].label,
            }))}
            onChange={(preset) => onMp4PresetChange(preset as ExportPreset)}
          />
        </label>
        <Mp4ExportMeta
          frameCount={frameCount}
          playbackFps={playbackFps}
          orientation={orientation}
          mp4Preset={mp4Preset}
        />
        <button
          type="button"
          className="panel-btn has-hint"
          data-hint="Offline render · H.264 via WebCodecs"
          onClick={onExportMp4}
        >
          Export MP4
        </button>
        </HeadlineDisclosure>
      </section>

      <section
        className={
          exportOpen.gif ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineDisclosure
          title="GIF"
          open={exportOpen.gif}
          onToggle={() => toggleExportFormat("gif")}
        >
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="Recommended 480p · max 720p">
              Resolution
            </HintLabel>
          </span>
          <UiSelect
            value={gifPreset}
            options={Object.entries(GIF_EXPORT_PRESETS).map(([key, preset]) => ({
              value: key,
              label: `${preset.label} — ${preset.note}`,
            }))}
            onChange={(preset) =>
              onGifPresetChange(preset as GifExportPreset)
            }
          />
        </label>
        <label className="control-row">
          <span className="control-row__label">
            <HintLabel hint="GIF frame holds — approximate timing · use MP4 for exact fps">
              Frame duration
            </HintLabel>
          </span>
          <UiSelect
            value={clampGifFrameDelayCs(gifFrameDelayCs, frameCount)}
            options={GIF_FRAME_DELAY_PRESETS.map((preset) => ({
              value: String(preset.cs),
              label: `${preset.label} — ${preset.note}`,
              disabled:
                gifDurationSeconds(frameCount, preset.cs) >
                GIPHY_DURATION_MAX_S,
            }))}
            onChange={(delayCs) => onGifFrameDelayChange(Number(delayCs))}
          />
        </label>
        <GifExportMeta frameCount={frameCount} delayCs={gifFrameDelayCs} />
        <button type="button" className="panel-btn" onClick={onExportGif}>
          Export GIF
        </button>
        </HeadlineDisclosure>
      </section>

      <section
        className={
          exportOpen.svg ? "panel-section" : "panel-section is-off"
        }
      >
        <HeadlineDisclosure
          title="SVG"
          open={exportOpen.svg}
          onToggle={() => toggleExportFormat("svg")}
        >
        <p className="export-group__meta">
          Shapes and grids · no blur, noise, or texture
        </p>
        <button
          type="button"
          className="panel-btn has-hint"
          data-hint="Paused colours export as transparent holes"
          onClick={onExportSvgFrame}
        >
          Export SVG Frame
        </button>
        </HeadlineDisclosure>
      </section>
      </>
      ) : (
      <>
      <section className="panel-section">
        <h2>Project</h2>
        <input
          ref={projectInputRef}
          type="file"
          accept={MZK_EXTENSION}
          className="import-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!isMzkFile(file)) return;
            onLoadProject(file);
          }}
        />
        <div className="button-row">
          <button type="button" className="panel-btn" onClick={onSaveProject}>
            Save Project
          </button>
          <button
            type="button"
            className="panel-btn panel-btn--ghost"
            disabled={loadingProject}
            onClick={() => projectInputRef.current?.click()}
          >
            {loadingProject ? "Loading…" : "Load Project"}
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h2>Copy / Paste Settings</h2>
        <div className="button-row">
          <button type="button" className="panel-btn panel-btn--ghost" onClick={onCopySettings}>
            Copy Settings
          </button>
          <button
            type="button"
            className="panel-btn panel-btn--ghost"
            onClick={onPasteSettings}
          >
            Paste Settings
          </button>
        </div>
      </section>

      <section
        className={
          highQualityMode ? "panel-section" : "panel-section is-off"
        }
      >
        <h2>Playback</h2>
        <ToggleRow
          label="High Quality Mode"
          hint="Keep blur on during sequence playback"
          checked={highQualityMode}
          onChange={(next) => {
            onHighQualityModeChange(next);
            if (next && !highQualityModeWarned) {
              highQualityModeWarned = true;
              setHighQualityDialogOpen(true);
            }
          }}
        />
      </section>

      <section className={`panel-section${soundsOn ? "" : " is-off"}`}>
        <h2>More</h2>
        <ToggleRow
          label="UI Sounds"
          checked={soundsOn}
          onChange={(next) => {
            setUiSoundsEnabled(next);
            setSoundsOn(next);
          }}
        />
        <SliderRow
          label="UI Sounds Volume"
          value={soundVolume}
          min={0}
          max={100}
          suffix="%"
          disabled={!soundsOn}
          onChange={(volume) => {
            setUiSoundsVolume(volume);
            setSoundVolume(volume);
          }}
        />
        <ToggleRow
          label="Normal Hover Effects"
          hint="Static highlights · no blink"
          checked={normalHover}
          onChange={(next) => {
            setNormalHoverEffects(next);
            setNormalHover(next);
          }}
        />
        <ToggleRow
          label="Normal Cursor"
          hint="System pointer · no pixel set"
          checked={normalCursor}
          onChange={(next) => {
            setNormalCursor(next);
            setNormalCursorOn(next);
          }}
        />
        <ToggleRow
          label="Shortcut Legend"
          hint="Flash labels on canvas · ~1s"
          checked={shortcutLegendOn}
          onChange={(next) => {
            setShortcutLegendEnabled(next);
            setShortcutLegendOn(next);
          }}
        />
        <div className="control-row">
          <span className="control-row__label">Theme</span>
          <div className="button-row button-row--choice">
            {CHROME_APPEARANCES.map((id) => (
              <button
                key={id}
                type="button"
                className={chromeAppearance === id ? "is-active" : ""}
                onClick={() => selectChromeAppearance(id)}
              >
                {CHROME_APPEARANCE_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
        <div className="control-row">
          <span className="control-row__label">Colour</span>
          <div className="button-row button-row--choice">
            {CHROME_COLORS.map((id) => (
              <button
                key={id}
                type="button"
                className={chromeColor === id ? "is-active" : ""}
                onClick={() => selectChromeColor(id)}
              >
                {CHROME_COLOR_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel-section">
        <h2>Keyboard Shortcuts</h2>
        <ul className="shortcut-list">
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>F</kbd>
            </p>
            <p className="shortcut-list__desc">Toggle fullscreen</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>Space</kbd>
            </p>
            <p className="shortcut-list__desc">Play / stop</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>←</kbd> <kbd>→</kbd>
            </p>
            <p className="shortcut-list__desc">Previous / next frame</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>↑</kbd> <kbd>↓</kbd>
            </p>
            <p className="shortcut-list__desc">Increase / decrease grid density</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>O</kbd>
            </p>
            <p className="shortcut-list__desc">Toggle original photo</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>Esc</kbd>
            </p>
            <p className="shortcut-list__desc">Exit 100% inspect</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>Q</kbd>
            </p>
            <p className="shortcut-list__desc">Randomize layout</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>W</kbd>
            </p>
            <p className="shortcut-list__desc">Randomize all</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>E</kbd>
            </p>
            <p className="shortcut-list__desc">Randomize current colours</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>I</kbd>
            </p>
            <p className="shortcut-list__desc">Invert all</p>
          </li>
          <li className="shortcut-list__row">
            <p className="shortcut-list__keys">
              <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd>
            </p>
            <p className="shortcut-list__desc">Undo</p>
          </li>
        </ul>
      </section>

      <section className="panel-section">
        <h2>Brand</h2>
        <a
          className="panel-btn"
          href={`${import.meta.env.BASE_URL}logo.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Mozayk Logotype Creator
        </a>
      </section>
      </>
      )}

      <footer className="panel-credit">
        <p>
          Mozayk is created by
          <br />
          <button
            type="button"
            className="panel-credit__author"
            onClick={() => {
              playUiSound("ok");
              setAboutOpen(true);
            }}
          >
            Stellan Johansson
          </button>
          <br />
          <br />
          <span className="panel-credit__social">
            <a
              href="https://x.com/johstell"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
            >
              <span className="panel-credit__icon panel-credit__icon--x" aria-hidden="true" />
            </a>
            <a
              href="https://github.com/stellanjoh2/Mosaik"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 98 96" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M41.4395 69.3848C28.8066 67.8535 19.9062 58.7617 19.9062 46.9902C19.9062 42.2051 21.6289 37.0371 24.5 33.5918C23.2559 30.4336 23.4473 23.7344 24.8828 20.959C28.7109 20.4805 33.8789 22.4902 36.9414 25.2656C40.5781 24.1172 44.4062 23.543 49.0957 23.543C53.7852 23.543 57.6133 24.1172 61.0586 25.1699C64.0254 22.4902 69.2891 20.4805 73.1172 20.959C74.457 23.543 74.6484 30.2422 73.4043 33.4961C76.4668 37.1328 78.0937 42.0137 78.0937 46.9902C78.0937 58.7617 69.1934 67.6621 56.3691 69.2891C59.623 71.3945 61.8242 75.9883 61.8242 81.252L61.8242 91.2051C61.8242 94.0762 64.2168 95.7031 67.0879 94.5547C84.4102 87.9512 98 70.6289 98 49.1914C98 22.1074 75.9883 6.69539e-07 48.9043 4.309e-07C21.8203 1.92261e-07 -1.9479e-07 22.1074 -4.3343e-07 49.1914C-6.20631e-07 70.4375 13.4941 88.0469 31.6777 94.6504C34.2617 95.6074 36.75 93.8848 36.75 91.3008L36.75 83.6445C35.4102 84.2188 33.6875 84.6016 32.1562 84.6016C25.8398 84.6016 22.1074 81.1563 19.4277 74.7441C18.375 72.1602 17.2266 70.6289 15.0254 70.3418C13.877 70.2461 13.4941 69.7676 13.4941 69.1934C13.4941 68.0449 15.4082 67.1836 17.3223 67.1836C20.0977 67.1836 22.4902 68.9063 24.9785 72.4473C26.8926 75.2227 28.9023 76.4668 31.2949 76.4668C33.6875 76.4668 35.2187 75.6055 37.4199 73.4043C39.0469 71.7773 40.291 70.3418 41.4395 69.3848Z"
                />
              </svg>
            </a>
          </span>
        </p>
      </footer>
      </div>
    </aside>
    </>
  );
}

function Mp4ExportMeta({
  frameCount,
  playbackFps,
  orientation,
  mp4Preset,
}: {
  frameCount: number;
  playbackFps: number;
  orientation: Orientation;
  mp4Preset: ExportPreset;
}) {
  const durationS = frameCount / Math.max(playbackFps, 1);
  const [width, height] = getMp4ExportSize(orientation, mp4Preset);

  return (
    <p className="export-group__meta">
      {width}×{height} · {frameCount} {frameCount === 1 ? "frame" : "frames"} ·{" "}
      {durationS.toFixed(2)}s · {playbackFps} fps
    </p>
  );
}

function GifExportMeta({
  frameCount,
  delayCs,
}: {
  frameCount: number;
  delayCs: number;
}) {
  const heldCs = clampGifFrameDelayCs(delayCs, frameCount);
  const durationS = gifDurationSeconds(frameCount, heldCs);
  const fps = gifFpsFromDelayCs(heldCs);
  const fpsLabel = Number.isInteger(fps) ? String(fps) : fps.toFixed(1);
  const overLimit = durationS > GIPHY_DURATION_MAX_S;
  const overRecommended = durationS > GIPHY_DURATION_RECOMMENDED_S;
  const note = overLimit
    ? " · over 15s limit"
    : overRecommended
      ? " · over 6s recommendation"
      : "";

  return (
    <p
      className={
        overRecommended ? "export-group__meta is-warn" : "export-group__meta"
      }
    >
      {frameCount} {frameCount === 1 ? "frame" : "frames"} · {durationS.toFixed(2)}s ·{" "}
      {fpsLabel} fps{note}
    </p>
  );
}

export { MAX_FRAMES };
