import { useRef } from "react";
import { DEFAULT_FPS, EXPORT_PRESETS, MAX_COLORS, MAX_FRAMES, type ExportPreset } from "../config";
import {
  DENSITY_INFO,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import type { Density, Frame, FrameSettings, Orientation } from "../types";
import { SUPPORTED_IMAGE_ACCEPT } from "../import/supportedImageTypes";
import { ColorSwatch } from "./ColorSwatch";
import { SliderRow, ToggleRow } from "./ControlRow";
import { HintLabel } from "./HintLabel";

type ControlsPanelProps = {
  frame: Frame;
  orientation: Orientation;
  exportPreset: ExportPreset;
  onSettingsChange: (patch: Partial<FrameSettings>, immediateLayout?: boolean) => void;
  onRandomizeLayout: () => void;
  onRandomizeAll: () => void;
  onCopySettings: () => void;
  onPasteSettings: () => void;
  canPasteSettings: boolean;
  onRandomizeCurrentColors: () => void;
  onRandomizeNewColors: () => void;
  onAddColor: () => void;
  onRemoveColor: (index: number) => void;
  onColorChange: (index: number, hex: string) => void;
  onToggleColorLock: (index: number) => void;
  onColorAmountChange: (index: number, amount: number) => void;
  onOrientationChange: (orientation: Orientation) => void;
  onExportPresetChange: (preset: ExportPreset) => void;
  onExportPngFrame: () => void;
  onExportPngTransparent: () => void;
  onExportPngSequence: () => void;
  onExportSvgFrame: () => void;
  onImportImage: (file: File) => void;
  importingImage?: boolean;
  onResetCanvas: () => void;
};

export function ControlsPanel({
  frame,
  orientation,
  exportPreset,
  onSettingsChange,
  onRandomizeLayout,
  onRandomizeAll,
  onCopySettings,
  onPasteSettings,
  canPasteSettings,
  onRandomizeCurrentColors,
  onRandomizeNewColors,
  onAddColor,
  onRemoveColor,
  onColorChange,
  onToggleColorLock,
  onColorAmountChange,
  onOrientationChange,
  onExportPresetChange,
  onExportPngFrame,
  onExportPngTransparent,
  onExportPngSequence,
  onExportSvgFrame,
  onImportImage,
  importingImage = false,
  onResetCanvas,
}: ControlsPanelProps) {
  const { settings } = frame;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shapes = settings.shapes ?? { sphere: false, ring: false, triangle: false };
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);

  return (
    <aside className="controls-panel">
      <header className="controls-panel__head">
        <img
          className="controls-panel__logo"
          src="/mosaik_logo.png"
          alt="Mosaik"
        />
      </header>

      <section className="panel-section">
        <h2>Canvas</h2>
        <div className="button-row button-row--3">
          <button
            type="button"
            className={orientation === "landscape" ? "is-active" : ""}
            onClick={() => onOrientationChange("landscape")}
          >
            16:9
          </button>
          <button
            type="button"
            className={orientation === "square" ? "is-active" : ""}
            onClick={() => onOrientationChange("square")}
          >
            1:1
          </button>
          <button
            type="button"
            className={orientation === "portrait" ? "is-active" : ""}
            onClick={() => onOrientationChange("portrait")}
          >
            9:16
          </button>
        </div>
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <select
            value={settings.density}
            onChange={(e) =>
              onSettingsChange(
                { density: Number(e.target.value) as Density },
                true,
              )
            }
          >
            {DENSITY_INFO.map((info) => (
              <option key={info.level} value={info.level}>
                {info.level}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel-section">
        <h2>Import</h2>
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
        <button
          type="button"
          className="panel-btn"
          disabled={importingImage}
          onClick={() => fileInputRef.current?.click()}
        >
          {importingImage ? "Importing…" : "Upload Image"}
        </button>
        {frame.imageSource ? (
          <ToggleRow
            label="Show Source Image"
            hint="Reveal the photo in gaps between shapes"
            checked={Boolean(frame.settings.showSourceImage)}
            onChange={(showSourceImage) => onSettingsChange({ showSourceImage })}
          />
        ) : null}
        <p className="panel-hint">
          Randomize Layout re-interprets the photo with new shapes while keeping its colours
        </p>
      </section>

      <section className="panel-section">
        <h2>Layout</h2>
        <button
          type="button"
          className="panel-btn has-hint"
          data-hint="Keeps your current slider settings"
          onClick={onRandomizeLayout}
        >
          Randomize Layout
        </button>
        <button
          type="button"
          className="panel-btn panel-btn--ghost has-hint"
          data-hint="Also randomizes all sliders"
          onClick={onRandomizeAll}
        >
          Randomize All
        </button>
        <div className="button-row">
          <button type="button" className="panel-btn panel-btn--ghost" onClick={onCopySettings}>
            Copy Settings
          </button>
          <button
            type="button"
            className="panel-btn panel-btn--ghost"
            disabled={!canPasteSettings}
            onClick={onPasteSettings}
          >
            Paste Settings
          </button>
        </div>
        <p className="control-row__label control-row__label--solo">
          <HintLabel hint="Blocks always on · toggle extras to mix in">Additional Shapes</HintLabel>
        </p>
        <div className="button-row button-row--3 button-row--shape-icons">
          <button
            type="button"
            aria-label="Spheres"
            aria-pressed={shapes.sphere}
            className={shapes.sphere ? "is-active" : ""}
            onClick={() =>
              onSettingsChange({
                shapes: { ...shapes, sphere: !shapes.sphere },
              })
            }
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
            onClick={() =>
              onSettingsChange({
                shapes: { ...shapes, ring: !shapes.ring },
              })
            }
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
            onClick={() =>
              onSettingsChange({
                shapes: { ...shapes, triangle: !shapes.triangle },
              })
            }
          >
            <svg className="shape-icon" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="2,2 22,2 22,22" fill="currentColor" />
            </svg>
          </button>
        </div>
        <SliderRow
          label="Shape Mix"
          hint="0 = blocks only · 100 = mix all enabled"
          value={settings.shapeMix}
          onChange={(shapeMix) => onSettingsChange({ shapeMix })}
        />
        <SliderRow
          label="Ring Thickness"
          hint="0 = solid · 100 = thin · same on every ring"
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
          hint="1 similar ← contrast → 6 large+small"
          value={settings.scaleBlend}
          min={1}
          max={6}
          step={1}
          onChange={(scaleBlend) => onSettingsChange({ scaleBlend })}
        />
        <SliderRow
          label="Distribution"
          hint="Left ← even → right"
          value={settings.weight}
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
        {settings.colors.length < MAX_COLORS ? (
          <button type="button" className="panel-btn" onClick={onAddColor}>
            Add Colour
          </button>
        ) : null}
        <div className="color-list">
          {settings.colors.map((color, index) => (
            <div key={`color-${index}`} className="color-row">
              <ColorSwatch
                color={color}
                locked={settings.colorsLocked?.[index] ?? false}
                onChange={(hex) => onColorChange(index, hex)}
                onToggleLock={() => onToggleColorLock(index)}
                onRemove={
                  settings.colors.length > 1
                    ? () => onRemoveColor(index)
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
          ))}
        </div>
        <button type="button" className="panel-btn" onClick={onRandomizeCurrentColors}>
          Randomize Current Colours
        </button>
        <button type="button" className="panel-btn panel-btn--ghost" onClick={onRandomizeNewColors}>
          New Random Colours
        </button>
        <label className="control-row">
          <span className="control-row__label">Background</span>
          <select
            value={settings.background}
            onChange={(e) =>
              onSettingsChange(
                {
                  background: e.target.value as FrameSettings["background"],
                },
                false,
              )
            }
          >
            <option value="black">Black</option>
            <option value="transparent">Transparent</option>
          </select>
        </label>
      </section>

      <section className="panel-section">
        <h2>Export</h2>

        <div className="export-group">
          <h3 className="export-group__title">PNG</h3>
          <label className="control-row">
            <span className="control-row__label">
              <HintLabel
                hint={`Preview matches display · playback ${DEFAULT_FPS} fps`}
              >
                Resolution
              </HintLabel>
            </span>
            <select
              value={exportPreset}
              onChange={(e) => onExportPresetChange(e.target.value as ExportPreset)}
            >
              {Object.entries(EXPORT_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.label}
                </option>
              ))}
            </select>
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
        </div>

        <div className="export-group">
          <h3 className="export-group__title">SVG</h3>
          <button
            type="button"
            className="panel-btn has-hint"
            data-hint="Paused colours export as transparent holes"
            onClick={onExportSvgFrame}
          >
            Export SVG Frame
          </button>
        </div>

        <div className="export-group">
          <button
            type="button"
            className="panel-btn panel-btn--ghost"
            onClick={onResetCanvas}
          >
            Reset Canvas
          </button>
        </div>
      </section>
    </aside>
  );
}

export { MAX_FRAMES };
