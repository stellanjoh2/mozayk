import { useRef } from "react";
import { DEFAULT_FPS, EXPORT_PRESETS, MAX_COLORS, MAX_FRAMES, type ExportPreset } from "../config";
import {
  DENSITY_INFO,
  maxHeightSliderMax,
  maxWidthSliderMax,
} from "../grid/density";
import {
  GRID_CROSS_SIZE_DEFAULT,
  GRID_CROSS_SIZE_MAX,
  GRID_CROSS_SIZE_MIN,
  GRID_OVERLAY_STROKES,
  resolveGridOverlayStroke,
} from "../render/gridOverlayParams";
import type { Density, Frame, FrameSettings, Orientation } from "../types";
import { SUPPORTED_IMAGE_ACCEPT } from "../import/supportedImageTypes";
import { BrandLogo } from "./BrandLogo";
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
  inspecting: boolean;
  onToggleInspect: () => void;
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
  inspecting,
  onToggleInspect,
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
  const shapes = settings.shapes ?? {
    sphere: false,
    ring: false,
    triangle: false,
    cross: false,
  };
  const widthMax = maxWidthSliderMax(settings.density, orientation);
  const heightMax = maxHeightSliderMax(settings.density, orientation);

  return (
    <aside className="controls-panel">
      <header className="controls-panel__head">
        <BrandLogo className="controls-panel__logo" />
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
          <div className="orientation-inspect">
            <button
              type="button"
              className={orientation === "portrait" ? "is-active" : ""}
              onClick={() => onOrientationChange("portrait")}
            >
              9:16
            </button>
            <button
              type="button"
              className={["orientation-inspect__loupe", inspecting ? "is-active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={onToggleInspect}
              aria-label="Inspect 9:16 at 100%"
              aria-pressed={inspecting}
              title="Inspect at 100% (1080×1920)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="10.5"
                  cy="10.5"
                  r="6.25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M15.2 15.2 21 21"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
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
        <p className="control-row__label control-row__label--solo">
          <HintLabel hint="Blocks always on · toggle extras to mix in">Additional Shapes</HintLabel>
        </p>
        <div className="button-row button-row--4 button-row--shape-icons">
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
          <button
            type="button"
            aria-label="Crosses"
            aria-pressed={Boolean(shapes.cross)}
            className={shapes.cross ? "is-active" : ""}
            onClick={() =>
              onSettingsChange({
                shapes: { ...shapes, cross: !shapes.cross },
              })
            }
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
        <h2>Grid Overlay</h2>
        <div className="export-group">
          <h3 className="export-group__title">Lines</h3>
          <ToggleRow
            label="Enabled"
            hint="Grid drawn over the mosaic"
            checked={Boolean(settings.gridOverlay)}
            onChange={(gridOverlay) => onSettingsChange({ gridOverlay }, false)}
          />
          <label className="control-row">
            <span className="control-row__label">Grid Density</span>
            <select
              value={settings.gridOverlayDensity ?? settings.density}
              onChange={(e) =>
                onSettingsChange(
                  {
                    gridOverlayDensity: Number(e.target.value) as Density,
                  },
                  false,
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
            label="Randomness"
            hint="Break the square grid into irregular paths"
            value={settings.gridOverlayChaos ?? 0}
            min={0}
            max={100}
            onChange={(gridOverlayChaos) =>
              onSettingsChange({ gridOverlayChaos }, false)
            }
          />
          <ToggleRow
            label="Difference"
            hint="Invert grid against colours underneath"
            checked={Boolean(settings.gridOverlayDifference)}
            onChange={(gridOverlayDifference) =>
              onSettingsChange({ gridOverlayDifference }, false)
            }
          />
        </div>
        <div className="export-group">
          <h3 className="export-group__title">Crosses</h3>
          <ToggleRow
            label="Enabled"
            hint="Pluses on grid intersections"
            checked={Boolean(settings.gridCrosses)}
            onChange={(gridCrosses) => onSettingsChange({ gridCrosses }, false)}
          />
          <label className="control-row">
            <span className="control-row__label">Grid Density</span>
            <select
              value={settings.gridCrossesDensity ?? settings.density}
              onChange={(e) =>
                onSettingsChange(
                  {
                    gridCrossesDensity: Number(e.target.value) as Density,
                  },
                  false,
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
            label="Randomness"
            hint="Omit crosses at random"
            value={settings.gridCrossesChaos ?? 0}
            min={0}
            max={100}
            onChange={(gridCrossesChaos) =>
              onSettingsChange({ gridCrossesChaos }, false)
            }
          />
          <ToggleRow
            label="Difference"
            hint="Invert crosses against colours underneath"
            checked={Boolean(settings.gridCrossesDifference)}
            onChange={(gridCrossesDifference) =>
              onSettingsChange({ gridCrossesDifference }, false)
            }
          />
        </div>
      </section>

      <section className="panel-section">
        <h2>Grid Blur</h2>
        <ToggleRow
          label="Enabled"
          hint="Gaussian blur over the finished mosaic · PNG only"
          checked={Boolean(settings.gridBlur)}
          onChange={(gridBlur) => onSettingsChange({ gridBlur }, false)}
        />
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <select
            value={settings.gridBlurDensity ?? settings.density}
            onChange={(e) =>
              onSettingsChange(
                {
                  gridBlurDensity: Number(e.target.value) as Density,
                },
                false,
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
          label="Randomness"
          hint="Break uniform blur into irregular on-grid patches"
          value={settings.gridBlurChaos ?? 0}
          min={0}
          max={100}
          onChange={(gridBlurChaos) =>
            onSettingsChange({ gridBlurChaos }, false)
          }
        />
      </section>

      <section className="panel-section">
        <h2>Bonus</h2>
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
          label="Hue"
          hint="Rotate colours of the finished image · PNG only"
          value={settings.hueShift ?? 0}
          min={-180}
          max={180}
          formatValue={(v) => `${v}°`}
          onChange={(hueShift) => onSettingsChange({ hueShift }, false)}
        />
      </section>

      <section className="panel-section">
        <h2>Grid Blur</h2>
        <ToggleRow
          label="Enabled"
          hint="Gaussian blur over the finished mosaic · PNG only"
          checked={Boolean(settings.gridBlur)}
          onChange={(gridBlur) => onSettingsChange({ gridBlur }, false)}
        />
        <label className="control-row">
          <span className="control-row__label">Grid Density</span>
          <select
            value={settings.gridBlurDensity ?? settings.density}
            onChange={(e) =>
              onSettingsChange(
                {
                  gridBlurDensity: Number(e.target.value) as Density,
                },
                false,
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
        <SliderRow
          label="Amount"
          hint="Blur radius relative to cell size"
          value={settings.gridBlurAmount ?? 50}
          min={0}
          max={100}
          onChange={(gridBlurAmount) =>
            onSettingsChange({ gridBlurAmount }, false)
          }
        />
        <SliderRow
          label="Randomness"
          hint="Keep irregular sharp patches"
          value={settings.gridBlurChaos ?? 0}
          min={0}
          max={100}
          onChange={(gridBlurChaos) =>
            onSettingsChange({ gridBlurChaos }, false)
          }
        />
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

      <section className="panel-section">
        <h2>Copy / Paste Settings</h2>
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
      </section>

      <footer className="panel-credit">
        <p>
          Mozayk is created by Stellan Johansson
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
        </p>
      </footer>
    </aside>
  );
}

export { MAX_FRAMES };
