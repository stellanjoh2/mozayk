import { useEffect, useId, useRef, useState } from "react";
import {
  MAX_VIDEO_DURATION_S,
  VIDEO_IMPORT_FPS,
  VIDEO_IMPORT_FPS_OPTIONS,
  type VideoImportFps,
} from "../config";
import {
  formatClipDuration,
  videoImportDurationS,
  videoImportFrameCount,
  type VideoProbe,
} from "../import/videoImport";
import { playUiSound } from "../ui/sounds";

type VideoImportDialogProps = {
  open: boolean;
  fileName: string;
  probe: VideoProbe | null;
  onCancel: () => void;
  onConfirm: (targetFps: VideoImportFps) => void;
};

export function VideoImportDialog({
  open,
  fileName,
  probe,
  onCancel,
  onConfirm,
}: VideoImportDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [targetFps, setTargetFps] = useState<VideoImportFps>(VIDEO_IMPORT_FPS);

  useEffect(() => {
    if (open) {
      setTargetFps(VIDEO_IMPORT_FPS);
      setMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    cancelRef.current?.focus();
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        playUiSound("close");
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, onCancel]);

  if (!mounted || !probe) return null;

  const importDurationS = videoImportDurationS(probe.duration);
  const clipTruncated = probe.duration > MAX_VIDEO_DURATION_S + 0.05;
  const frameCount = videoImportFrameCount(probe.duration, targetFps);

  return (
    <div
      className={["reset-canvas-backdrop", entered ? "is-open" : ""].filter(Boolean).join(" ")}
      role="presentation"
      onClick={() => {
        playUiSound("close");
        onCancel();
      }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!open) setMounted(false);
      }}
    >
      <div
        className="reset-canvas-dialog video-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="reset-canvas-dialog__title">
          Import video
        </h2>
        <p id={descId} className="reset-canvas-dialog__message">
          <span className="video-import-dialog__file">{fileName}</span>
          <span className="video-import-dialog__meta">
            {formatClipDuration(probe.duration)} clip ·{" "}
            {probe.orientation.charAt(0).toUpperCase() + probe.orientation.slice(1)}
          </span>
          {clipTruncated ? (
            <span className="video-import-dialog__note">
              Mozayk uses the first {MAX_VIDEO_DURATION_S} seconds (
              {formatClipDuration(importDurationS)}).
            </span>
          ) : null}
        </p>

        <div className="video-import-dialog__fps">
          <span className="video-import-dialog__fps-label">Frame rate</span>
          <div className="button-row button-row--3 button-row--choice video-import-dialog__fps-row">
            {VIDEO_IMPORT_FPS_OPTIONS.map((option) => (
              <button
                key={option.fps}
                type="button"
                className={targetFps === option.fps ? "is-active" : ""}
                onClick={() => setTargetFps(option.fps)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="video-import-dialog__fps-note">
            {VIDEO_IMPORT_FPS_OPTIONS.find((option) => option.fps === targetFps)?.note} ·{" "}
            {frameCount} {frameCount === 1 ? "frame" : "frames"}
          </p>
        </div>

        <div className="reset-canvas-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="panel-btn panel-btn--ghost"
            data-ui-sound="close"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="panel-btn"
            data-ui-sound="ok"
            onClick={() => onConfirm(targetFps)}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
