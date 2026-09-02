import { useRef, useState } from "react";
import {
  DISTRIBUTION_LABELS,
  DISTRIBUTIONS,
  MAX_ITEMS,
  MAX_RINGS,
  RATIO_LABELS,
  RATIOS,
  padBackgrounds,
  type Distribution,
  type GallerySettings,
  type Ratio,
} from "../types";
import { ColorRow, SliderRow } from "./ControlRow";

const MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,.jpg,.jpeg,.png,.webp,.gif,.avif,.mp4";

type ControlsPanelProps = {
  settings: GallerySettings;
  itemCount: number;
  selectedIndex: number;
  canReplace: boolean;
  ringCount: number;
  activeRing: number;
  onSettingsChange: (patch: Partial<GallerySettings>) => void;
  onAddFiles: (files: File[]) => void;
  onReplaceFile: (file: File) => void;
  onRemoveSelected: () => void;
  onAddRing: () => void;
  onActiveRingChange: (ring: number) => void;
};

export function ControlsPanel({
  settings,
  itemCount,
  selectedIndex,
  canReplace,
  ringCount,
  activeRing,
  onSettingsChange,
  onAddFiles,
  onReplaceFile,
  onRemoveSelected,
  onAddRing,
  onActiveRingChange,
}: ControlsPanelProps) {
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const atMax = itemCount >= MAX_ITEMS;

  const copySettings = () => {
    const text = JSON.stringify(
      {
        ratio: settings.ratio,
        distribution: settings.distribution,
        backgrounds: settings.backgrounds,
        distortion: settings.distortion,
        chromaticAberration: settings.chromaticAberration,
        overscan: settings.overscan,
        cameraZoom: settings.cameraZoom,
        focusZoom: settings.focusZoom,
        spinFriction: settings.spinFriction,
        cornerRadius: settings.cornerRadius,
        axisTilt: settings.axisTilt,
        ringTilt: settings.ringTilt,
      },
      null,
      2,
    );
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <aside className="controls-panel">
      <div className="controls-panel__inner">
        <div className="controls-panel__head">
          <h1>Gallery</h1>
        </div>

        <section className="panel-section">
          <h2>Ratio</h2>
          <p className="panel-hint">One ratio for the whole ring. Set this before you add art.</p>
          <div className="button-row button-row--3 button-row--choice">
            {RATIOS.map((value) => (
              <button
                key={value}
                type="button"
                className={settings.ratio === value ? "is-active" : ""}
                onClick={() => onSettingsChange({ ratio: value as Ratio })}
              >
                {RATIO_LABELS[value]}
              </button>
            ))}
          </div>
          <p className="panel-hint">Close packs them together. Ring spaces them around the full circle.</p>
          <div className="button-row button-row--choice">
            {DISTRIBUTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={settings.distribution === value ? "is-active" : ""}
                onClick={() =>
                  onSettingsChange({ distribution: value as Distribution })
                }
              >
                {DISTRIBUTION_LABELS[value]}
              </button>
            ))}
          </div>
          <SliderRow
            label="Ring axis"
            value={settings.axisTilt}
            min={-40}
            max={40}
            step={1}
            format={(v) => `${v}°`}
            onChange={(axisTilt) => onSettingsChange({ axisTilt })}
          />
          <SliderRow
            label="Ring tilt"
            value={settings.ringTilt}
            min={-40}
            max={40}
            step={1}
            format={(v) => `${v}°`}
            onChange={(ringTilt) => onSettingsChange({ ringTilt })}
          />
        </section>

        <section className="panel-section">
          <h2>Art</h2>
          <p className="panel-hint">
            JPG, AVIF, GIF, or MP4. Select several at once. {itemCount}/{MAX_ITEMS}{" "}
            on this ring
            {ringCount > 1 ? ` (${activeRing + 1} of ${ringCount})` : ""}.
          </p>
          <input
            ref={addRef}
            type="file"
            accept={MEDIA_ACCEPT}
            multiple
            className="import-file-input"
            onChange={(event) => {
              const list = event.target.files;
              const files = list ? Array.from(list) : [];
              event.target.value = "";
              if (files.length) onAddFiles(files);
            }}
          />
          <input
            ref={replaceRef}
            type="file"
            accept={MEDIA_ACCEPT}
            className="import-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onReplaceFile(file);
            }}
          />
          <button
            type="button"
            className="panel-btn"
            disabled={atMax}
            onClick={() => addRef.current?.click()}
          >
            {itemCount === 0 ? "Add images" : atMax ? "Ring full" : "Add images"}
          </button>
          <button
            type="button"
            className="panel-btn"
            disabled={ringCount >= MAX_RINGS}
            onClick={onAddRing}
          >
            {ringCount >= MAX_RINGS ? "3 rings" : "Add ring"}
          </button>
          {ringCount > 1 ? (
            <>
              <p className="panel-hint">
                Drag up or down to change floors. Keys 1, 2, 3 also work. Click a frame on another floor to ride there.
              </p>
              <div
                className={
                  ringCount === 3
                    ? "button-row button-row--3 button-row--choice"
                    : "button-row button-row--choice"
                }
              >
                {Array.from({ length: ringCount }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={activeRing === i ? "is-active" : ""}
                    onClick={() => onActiveRingChange(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <p className="panel-hint">
            {ringCount > 1
              ? "This floor only. The wash eases with the camera."
              : "Wash behind the ring."}
          </p>
          <ColorRow
            label="Floor color"
            value={settings.backgrounds[activeRing] ?? settings.backgrounds[0]}
            onChange={(color) => {
              const backgrounds = padBackgrounds(settings.backgrounds);
              backgrounds[activeRing] = color;
              onSettingsChange({ backgrounds });
            }}
          />
          <div className="button-row">
            <button
              type="button"
              disabled={!canReplace}
              onClick={() => replaceRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              disabled={selectedIndex < 0}
              onClick={onRemoveSelected}
            >
              Remove
            </button>
          </div>
        </section>

        <section className="panel-section">
          <h2>Lens</h2>
          <SliderRow
            label="Distortion"
            value={settings.distortion}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(distortion) => onSettingsChange({ distortion })}
          />
          <SliderRow
            label="Overscan"
            value={settings.overscan}
            min={0.5}
            max={2.5}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(overscan) => onSettingsChange({ overscan })}
          />
          <SliderRow
            label="Primary zoom"
            value={settings.cameraZoom}
            min={0.5}
            max={1.6}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(cameraZoom) => onSettingsChange({ cameraZoom })}
          />
          <SliderRow
            label="Focused zoom"
            value={settings.focusZoom}
            min={0.5}
            max={1.6}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(focusZoom) => onSettingsChange({ focusZoom })}
          />
          <SliderRow
            label="Friction"
            value={settings.spinFriction}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(spinFriction) => onSettingsChange({ spinFriction })}
          />
          <SliderRow
            label="Chromatic aberration"
            value={settings.chromaticAberration}
            min={0}
            max={0.1}
            step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(chromaticAberration) =>
              onSettingsChange({ chromaticAberration })
            }
          />
        </section>

        <section className="panel-section">
          <h2>Look</h2>
          <SliderRow
            label="Rounded corners"
            value={settings.cornerRadius}
            min={0}
            max={0.45}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(cornerRadius) => onSettingsChange({ cornerRadius })}
          />
        </section>

        <section className="panel-section">
          <h2>Defaults</h2>
          <p className="panel-hint">Copy the current sliders to paste when we change startup defaults.</p>
          <button type="button" className="panel-btn" onClick={copySettings}>
            {copied ? "Copied" : "Copy settings"}
          </button>
        </section>
      </div>
    </aside>
  );
}
