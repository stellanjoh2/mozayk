import { CrtGlide } from "./CrtGlide";

type VideoImportOverlayProps = {
  label: string;
};

export function VideoImportOverlay({ label }: VideoImportOverlayProps) {
  return (
    <div
      className="video-import-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <CrtGlide />
    </div>
  );
}
