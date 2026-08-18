import { useRef, useState } from "react";
import { ColorPicker } from "./ColorPicker";
import { RemoveIconButton } from "./ControlRowWithPause";
import { PauseButton } from "./PauseButton";
import { hexToRgb, normalizeHex } from "../colorMath";

type ColorSwatchProps = {
  color: string;
  locked?: boolean;
  disabled?: boolean;
  onChange: (hex: string) => void;
  onToggleLock?: () => void;
  onRemove?: () => void;
};

function hexOnColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55 ? "#111111" : "#ffffff";
}

export function ColorSwatch({
  color,
  locked = false,
  disabled = false,
  onChange,
  onToggleLock,
  onRemove,
}: ColorSwatchProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hex = normalizeHex(color);

  return (
    <div className="color-swatch-wrap">
      <button
        ref={anchorRef}
        type="button"
        className="color-swatch"
        style={{ background: hex, color: hexOnColor(hex) }}
        aria-label={`Color ${hex}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
      >
        <span className="color-swatch__hex">{hex.toUpperCase()}</span>
      </button>
      {onToggleLock || onRemove ? (
        <div className="color-swatch__actions">
          {onToggleLock ? (
            <PauseButton
              paused={locked}
              hint="Keep this colour when randomizing · omit from SVG & transparent PNG export"
              ariaLabel={
                locked
                  ? "Include colour in randomization"
                  : "Exclude colour from randomization"
              }
              onToggle={() => onToggleLock()}
            />
          ) : null}
          {onRemove ? (
            <RemoveIconButton
              ariaLabel="Remove colour"
              onClick={onRemove}
            />
          ) : null}
        </div>
      ) : null}
      {open ? (
        <ColorPicker
          value={normalizeHex(color)}
          anchorRef={anchorRef}
          onChange={(hex) => onChangeRef.current(hex)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
