type SliderRowProps = {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** Overrides the numeric value display (e.g. discrete px steps). */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

import { HintLabel } from "./HintLabel";

export function SliderRow({
  label,
  hint,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  formatValue,
  disabled = false,
  onChange,
}: SliderRowProps) {
  return (
    <label className={`control-row${disabled ? " control-row--muted" : ""}`}>
      <span className="control-row__label">
        <HintLabel hint={hint}>{label}</HintLabel>
        <span className="control-row__value">
          {formatValue ? formatValue(value) : `${value}${suffix ?? ""}`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

type ToggleRowProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <label className="control-row control-row--toggle">
      <span className="control-row__label">
        <HintLabel hint={hint}>{label}</HintLabel>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

type HeadlineToggleProps = {
  title: string;
  hint?: string;
  level?: 2 | 3;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function HeadlineToggle({
  title,
  hint,
  level = 2,
  checked,
  onChange,
}: HeadlineToggleProps) {
  const Tag = level === 3 ? "h3" : "h2";
  return (
    <label
      className={
        level === 3
          ? "headline-toggle headline-toggle--sub"
          : "headline-toggle"
      }
    >
      <Tag className={level === 3 ? "export-group__title" : undefined}>
        <HintLabel hint={hint}>{title}</HintLabel>
      </Tag>
      <input
        type="checkbox"
        checked={checked}
        aria-label={title}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
