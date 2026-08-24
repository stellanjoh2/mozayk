import type { ComponentProps } from "react";
import {
  CollapsibleControls,
  HeadlineToggle,
  SliderRow,
  ToggleRow,
} from "./ControlRow";
import { PauseButton } from "./PauseButton";
import { HintLabel } from "./HintLabel";
import { playUiSound } from "../ui/sounds";
import type { RandomizePauseKey } from "../types";

type SliderRowWithPauseProps = ComponentProps<typeof SliderRow> & {
  pauseKey?: RandomizePauseKey;
  randomizePaused?: boolean;
  onToggleRandomizePause?: (key: RandomizePauseKey) => void;
  pauseHint?: string;
};

export function SliderRowWithPause({
  pauseKey,
  randomizePaused = false,
  onToggleRandomizePause,
  pauseHint,
  label,
  hint,
  disabled = false,
  ...sliderProps
}: SliderRowWithPauseProps) {
  const showPause = pauseKey && onToggleRandomizePause;

  return (
    <div
      className={`control-row-with-pause${disabled ? " control-row-with-pause--muted" : ""}`}
    >
      {showPause ? (
        <PauseButton
          paused={randomizePaused}
          disabled={disabled}
          hint={pauseHint}
          ariaLabel={
            randomizePaused
              ? `Include ${label} in Randomize All`
              : `Exclude ${label} from Randomize All`
          }
          onToggle={() => onToggleRandomizePause(pauseKey)}
        />
      ) : null}
      <SliderRow
        label={label}
        hint={hint}
        disabled={disabled}
        {...sliderProps}
      />
    </div>
  );
}

type ToggleRowWithPauseProps = ComponentProps<typeof ToggleRow> & {
  pauseKey?: RandomizePauseKey;
  randomizePaused?: boolean;
  onToggleRandomizePause?: (key: RandomizePauseKey) => void;
  pauseHint?: string;
};

export function ToggleRowWithPause({
  pauseKey,
  randomizePaused = false,
  onToggleRandomizePause,
  pauseHint,
  label,
  hint,
  checked,
  onChange,
}: ToggleRowWithPauseProps) {
  const showPause = pauseKey && onToggleRandomizePause;

  return (
    <div className="control-row-with-pause control-row-with-pause--toggle">
      {showPause ? (
        <PauseButton
          paused={randomizePaused}
          hint={pauseHint}
          ariaLabel={
            randomizePaused
              ? `Include ${label} in Randomize All`
              : `Exclude ${label} from Randomize All`
          }
          onToggle={() => onToggleRandomizePause(pauseKey)}
        />
      ) : null}
      <ToggleRow label={label} hint={hint} checked={checked} onChange={onChange} />
    </div>
  );
}

type HeadlineToggleWithPauseProps = ComponentProps<typeof HeadlineToggle> & {
  pauseKey?: RandomizePauseKey;
  randomizePaused?: boolean;
  onToggleRandomizePause?: (key: RandomizePauseKey) => void;
  pauseHint?: string;
};

export function HeadlineToggleWithPause({
  pauseKey,
  randomizePaused = false,
  onToggleRandomizePause,
  pauseHint,
  title,
  hint,
  level,
  checked,
  onChange,
  children,
}: HeadlineToggleWithPauseProps) {
  const showPause = pauseKey && onToggleRandomizePause;

  return (
    <>
      <div
        className={[
          "headline-toggle-with-pause",
          level === 3 ? "headline-toggle-with-pause--sub" : "",
          checked ? "" : "is-off",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {showPause ? (
          <PauseButton
            paused={randomizePaused}
            hint={pauseHint}
            ariaLabel={
              randomizePaused
                ? `Include ${title} in Randomize All`
                : `Exclude ${title} from Randomize All`
            }
            onToggle={() => onToggleRandomizePause(pauseKey)}
          />
        ) : null}
        <HeadlineToggle
          title={title}
          hint={hint}
          level={level}
          checked={checked}
          onChange={onChange}
        />
      </div>
      {children != null ? (
        <CollapsibleControls open={checked}>{children}</CollapsibleControls>
      ) : null}
    </>
  );
}

type SectionHeadlineWithPauseProps = {
  title: string;
  hint?: string;
  pauseKey?: RandomizePauseKey;
  randomizePaused?: boolean;
  onToggleRandomizePause?: (key: RandomizePauseKey) => void;
  pauseHint?: string;
};

export function SectionHeadlineWithPause({
  title,
  hint,
  pauseKey,
  randomizePaused = false,
  onToggleRandomizePause,
  pauseHint,
}: SectionHeadlineWithPauseProps) {
  const showPause = pauseKey && onToggleRandomizePause;

  return (
    <div className="section-headline-with-pause">
      {showPause ? (
        <PauseButton
          paused={randomizePaused}
          hint={pauseHint}
          ariaLabel={
            randomizePaused
              ? `Include ${title} in Randomize All`
              : `Exclude ${title} from Randomize All`
          }
          onToggle={() => onToggleRandomizePause(pauseKey)}
        />
      ) : null}
      <h2>
        <HintLabel hint={hint}>{title}</HintLabel>
      </h2>
    </div>
  );
}

export function RemoveIconButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ui-icon-btn ui-icon-btn--remove"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        playUiSound("close");
        onClick();
      }}
    >
      ×
    </button>
  );
}

export { HeadlineToggle, SliderRow, ToggleRow };
