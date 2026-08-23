/** Play triangle — also used at half size for LoopIcon heads. */
const PLAY_TRIANGLE = "6,5 19,12 6,19";

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polygon points={PLAY_TRIANGLE} fill="currentColor" />
    </svg>
  );
}

export function CaretIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polygon
        points={PLAY_TRIANGLE}
        fill="currentColor"
        transform="rotate(90 12 12)"
      />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" fill="currentColor" />
    </svg>
  );
}

export function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 11V4.75H12V2.5L18.5 6 12 9.5V7.25H6.5V11H4zM20 13v6.25H12V21.5L5.5 18 12 14.5v2.25h5.5V13H20z"
      />
    </svg>
  );
}
