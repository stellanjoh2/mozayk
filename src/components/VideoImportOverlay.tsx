import { useEffect } from "react";
import { pauseFrost } from "../ui/frostPause";
import { CrtGlide } from "./CrtGlide";

type VideoImportOverlayProps = {
  label: string;
};

export function VideoImportOverlay({ label }: VideoImportOverlayProps) {
  // Full-viewport dim + glass shelf/tips still force a chrome blink even
  // without backdrop-filter on the dimmer — solidify frost for the mount.
  useEffect(() => pauseFrost(), []);

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
