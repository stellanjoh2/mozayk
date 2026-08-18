type PauseButtonProps = {
  paused?: boolean;
  disabled?: boolean;
  hint?: string;
  ariaLabel?: string;
  onToggle: () => void;
};

export function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="1.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
      <rect x="7.5" y="1.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function PauseButton({
  paused = false,
  disabled = false,
  hint = "Exclude from Randomize All",
  ariaLabel,
  onToggle,
}: PauseButtonProps) {
  return (
    <button
      type="button"
      className={`ui-icon-btn ui-icon-btn--pause has-hint${paused ? " is-locked" : ""}`}
      data-hint={hint}
      aria-label={
        ariaLabel ??
        (paused
          ? "Include in Randomize All"
          : "Exclude from Randomize All")
      }
      aria-pressed={paused}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <PauseIcon />
    </button>
  );
}
