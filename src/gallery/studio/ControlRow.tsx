import { useLayoutEffect, useState } from "react";

type SliderRowProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
};

export function SliderRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  format,
  onChange,
}: SliderRowProps) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const displayValue = dragValue ?? value;
  const span = max - min;
  const val = span === 0 ? 0 : ((displayValue - min) / span) * 100;
  const origin = min < 0 && max > 0 ? ((0 - min) / span) * 100 : 0;

  useLayoutEffect(() => {
    setDragValue(null);
  }, [value]);

  return (
    <label className="control-row">
      <span className="control-row__label">
        {label}
        <span className="control-row__value">
          {format ? format(displayValue) : String(displayValue)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        style={{ ["--val" as string]: val, ["--origin" as string]: origin }}
        onPointerDown={() => setDragValue(value)}
        onPointerUp={() => setDragValue(null)}
        onPointerCancel={() => setDragValue(null)}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDragValue(next);
          onChange(next);
        }}
      />
    </label>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="control-row control-row--color">
      <span className="control-row__label">
        {label}
        <span className="control-row__value">{value.toUpperCase()}</span>
      </span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
