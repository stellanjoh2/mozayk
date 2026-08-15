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
import { playUiSound } from "../ui/sounds";

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
  const span = max - min;
  const val = span === 0 ? 0 : ((value - min) / span) * 100;
  const origin = min < 0 && max > 0 ? ((0 - min) / span) * 100 : 0;

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
        style={
          {
            ["--val"]: val,
            ["--origin"]: origin,
          } as React.CSSProperties
        }
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

function SwitchControl({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <span className="ui-switch">
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = e.target.checked;
          playUiSound(next ? "ok" : "close");
          onChange(next);
        }}
      />
      <span className="ui-switch__track" />
    </span>
  );
}

export function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <label className="control-row control-row--toggle">
      <span className="control-row__label">
        <HintLabel hint={hint}>{label}</HintLabel>
      </span>
      <SwitchControl checked={checked} onChange={onChange} />
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
    <div
      className={[
        level === 3
          ? "headline-toggle headline-toggle--sub"
          : "headline-toggle",
        checked ? "" : "is-off",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Tag className={level === 3 ? "export-group__title" : undefined}>
        <HintLabel hint={hint}>{title}</HintLabel>
      </Tag>
      <SwitchControl
        checked={checked}
        onChange={onChange}
        ariaLabel={`Activate ${title}`}
      />
    </div>
  );
}
