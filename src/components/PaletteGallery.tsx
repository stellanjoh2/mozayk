import { useState } from "react";
import {
  sortColorsForPreview,
  type PalettePreset,
} from "../presets/palettePresets";

type PaletteGalleryProps = {
  presets: PalettePreset[];
  layout?: "grid" | "stack";
  onApplyPreset: (preset: PalettePreset) => void;
};

export function PaletteGallery({
  presets,
  layout = "grid",
  onApplyPreset,
}: PaletteGalleryProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div
      className={[
        "palette-gallery",
        layout === "stack" ? "palette-gallery--stack" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="list"
      aria-label="Palette presets"
    >
      {presets.map((preset) => {
        const isActive = activeId === preset.id;
        const previewColors = sortColorsForPreview(preset.colors);
        return (
          <button
            key={preset.id}
            type="button"
            role="listitem"
            className={`palette-gallery__item${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            aria-label={`Apply ${preset.label} palette`}
            onClick={() => {
              setActiveId(preset.id);
              onApplyPreset(preset);
            }}
          >
            <span className="palette-gallery__swatch" aria-hidden="true">
              {previewColors.map((color, bandIndex) => (
                <span
                  key={`${preset.id}-${bandIndex}`}
                  className="palette-gallery__band"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="palette-gallery__label">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
