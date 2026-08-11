import { DEFAULT_FPS, EXPORT_PRESETS, MAX_COLORS, MAX_FRAMES, type ExportPreset } from "../config";
import {
  DENSITY_INFO,
  maxCellSizeSliderMax,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import type { Density, Frame, FrameSettings, Orientation } from "../types";
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
  onColorAmountChange: (index: number, amount: number) => void;
  onOrientationChange: (orientation: Orientation) => void;
  onExportPresetChange: (preset: ExportPreset) => void;
  onExportPngFrame: () => void;
  onExportPngSequence: () => void;
  onExportSvgFrame: () => void;
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
  onColorAmountChange,
  onOrientationChange,
  onExportPresetChange,
  onExportPngFrame,
  onExportPngSequence,
  onExportSvgFrame,
}: ControlsPanelProps) {
  const { settings } = frame;
  const shapes = settings.shapes ?? { sphere: true, ring: false };
  const cellSizeMax = maxCellSizeSliderMax(settings.density, orientation);
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);

  return (
    <aside className="controls-panel">
      <header className="controls-panel__head">
        <h1>Mosaik</h1>
        <p className="controls-panel__sub">Procedural grid transitions</p>
      </header>

      <section className="panel-section">
        <h2>Canvas</h2>
        <div className="button-row">
          <button
            type="button"
            className={orientation === "landscape" ? "is-active" : ""}
            onClick={() => onOrientationChange("landscape")}
          >
            16:9
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
          <HintLabel hint="Blocks always on · toggle extras to mix in">Shapes</HintLabel>
        </p>
        <div className="button-row">
          <button
            type="button"
            className={shapes.sphere ? "is-active" : ""}
            onClick={() =>
              onSettingsChange({
                shapes: { ...shapes, sphere: !shapes.sphere },
              })
            }
          >
            Spheres
          </button>
          <button
            type="button"
            className={shapes.ring ? "is-active" : ""}
            onClick={() =>
              onSettingsChange({
                shapes: { ...shapes, ring: !shapes.ring },
              })
            }
          >
            Rings
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
          hint="0 = solid · 100 = thin ring"
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
          hint="1 macro ← mixed → 6 micro"
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
          label="Min Cell Size"
          value={settings.minCellSize}
          min={1}
          max={settings.maxCellSize}
          onChange={(minCellSize) => onSettingsChange({ minCellSize })}
        />
        <SliderRow
          label="Max Cell Size"
          value={settings.maxCellSize}
          min={settings.minCellSize}
          max={cellSizeMax}
          onChange={(maxCellSize) => onSettingsChange({ maxCellSize })}
        />
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
                onChange={(hex) => onColorChange(index, hex)}
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
              <HintLabel hint={`Preview at 1080p · playback ${DEFAULT_FPS} fps`}>
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
            className="panel-btn panel-btn--ghost"
            onClick={onExportPngSequence}
          >
            Export PNG Sequence (ZIP)
          </button>
        </div>

        <div className="export-group">
          <h3 className="export-group__title">SVG</h3>
          <button type="button" className="panel-btn" onClick={onExportSvgFrame}>
            Export SVG Frame
          </button>
        </div>
      </section>
    </aside>
  );
}

export { MAX_FRAMES };
