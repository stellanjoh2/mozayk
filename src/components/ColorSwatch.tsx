import { useRef, useState } from "react";
import { ColorPicker } from "./ColorPicker";
import { normalizeHex } from "../colorMath";

type ColorSwatchProps = {
  color: string;
  onChange: (hex: string) => void;
  onRemove?: () => void;
};

export function ColorSwatch({ color, onChange, onRemove }: ColorSwatchProps) {
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
