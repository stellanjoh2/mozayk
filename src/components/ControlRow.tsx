import { useLayoutEffect, useState, type ReactNode } from "react";

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
  const [dragValue, setDragValue] = useState<number | null>(null);
  const displayValue = dragValue ?? value;

  const span = max - min;
  const val = span === 0 ? 0 : ((displayValue - min) / span) * 100;
  const origin = min < 0 && max > 0 ? ((0 - min) / span) * 100 : 0;

  // Local overlay lets the fill lead App re-renders during a drag. Drop it when
  // the value comes from elsewhere (other frame, paste, undo).
  useLayoutEffect(() => {
    setDragValue(null);
  }, [value]);

  const handleChange = (next: number) => {
    setDragValue(next);
    onChange(next);
  };

  const endDrag = () => setDragValue(null);

  return (
    <label className={`control-row${disabled ? " control-row--muted" : ""}`}>
      <span className="control-row__label">
        <HintLabel hint={hint}>{label}</HintLabel>
        <span className="control-row__value">
          {formatValue ? formatValue(displayValue) : `${displayValue}${suffix ?? ""}`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        disabled={disabled}
        style={
          {
            ["--val"]: val,
            ["--origin"]: origin,
          } as React.CSSProperties
        }
        onPointerDown={() => setDragValue(value)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onChange={(e) => handleChange(Number(e.target.value))}
      />
    </label>
  );
}

type ToggleRowProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  shortcut?: string;
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

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  shortcut,
}: ToggleRowProps) {
  return (
    <label
      className="control-row control-row--toggle"
      data-shortcut={shortcut}
      aria-keyshortcuts={
        shortcut?.startsWith("Key")
          ? shortcut.slice(3).toLowerCase()
          : shortcut
      }
    >
      <span className="control-row__label">
        <HintLabel hint={hint}>{label}</HintLabel>
      </span>
      <SwitchControl checked={checked} onChange={onChange} />
    </label>
  );
}

export function CollapsibleControls({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        open ? "collapsible-controls is-open" : "collapsible-controls"
      }
      inert={!open}
      aria-hidden={!open}
    >
      <div className="collapsible-controls__inner">{children}</div>
    </div>
  );
}

type HeadlineToggleProps = {
  title: string;
  hint?: string;
  level?: 2 | 3;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
};

export function HeadlineToggle({
  title,
  hint,
  level = 2,
  checked,
  onChange,
  children,
}: HeadlineToggleProps) {
  const Tag = level === 3 ? "h3" : "h2";
  return (
    <>
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
      {children != null ? (
        <CollapsibleControls open={checked}>{children}</CollapsibleControls>
      ) : null}
    </>
  );
}

type HeadlineDisclosureProps = {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function HeadlineDisclosure({
  title,
  hint,
  open,
  onToggle,
  children,
}: HeadlineDisclosureProps) {
  return (
    <>
      <button
        type="button"
        className={
          open
            ? "headline-toggle headline-disclosure"
            : "headline-toggle headline-disclosure is-off"
        }
        aria-expanded={open}
        onClick={() => {
          playUiSound(open ? "close" : "ok");
          onToggle();
        }}
      >
        <h2>
          <HintLabel hint={hint}>{title}</HintLabel>
        </h2>
        <span className="headline-disclosure__caret" aria-hidden />
      </button>
      <CollapsibleControls open={open}>{children}</CollapsibleControls>
    </>
  );
}
