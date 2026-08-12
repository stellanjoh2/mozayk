import { useRef, useState } from "react";
import { ColorPicker } from "./ColorPicker";
import { normalizeHex } from "../colorMath";

type ColorSwatchProps = {
  color: string;
  locked?: boolean;
  onChange: (hex: string) => void;
  onToggleLock?: () => void;
  onRemove?: () => void;
};

export function ColorSwatch({
  color,
  locked = false,
  onChange,
  onToggleLock,
  onRemove,
}: ColorSwatchProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  return (
    <div className="color-swatch-wrap">
      <button
        ref={anchorRef}
        type="button"
        className="color-swatch"
        style={{ background: color }}
        aria-label={`Color ${color}`}
        onClick={() => setOpen(true)}
      />
      {onToggleLock || onRemove ? (
        <div className="color-swatch__actions">
          {onToggleLock ? (
            <button
              type="button"
              className={`color-swatch__lock has-hint${locked ? " is-locked" : ""}`}
              data-hint="Keep this colour when randomizing · omit from SVG & transparent PNG export"
              aria-label={
                locked
                  ? "Include colour in randomization"
                  : "Exclude colour from randomization"
              }
              aria-pressed={locked}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock();
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <rect x="2" y="1.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
                <rect x="7.5" y="1.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
              </svg>
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="color-swatch__remove"
              aria-label="Remove colour"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              ×
            </button>
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
