type SliderRowProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
};

export function SliderRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  onChange,
}: SliderRowProps) {
  return (
    <label className="control-row">
      <span className="control-row__label">
        {label}
        <span className="control-row__value">
          {value}
          {suffix ?? ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="control-row control-row--toggle">
      <span className="control-row__label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
