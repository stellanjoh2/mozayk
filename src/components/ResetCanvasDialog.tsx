import { useEffect, useId, useRef, useState } from "react";
import { getProTipsVoiceAssist } from "../ui/proTips";
import {
  playUiSound,
  playUiSoundOnNextGesture,
  stopVoiceSound,
} from "../ui/sounds";
import { TypewriterReveal } from "./TypewriterReveal";

const RESET_VOICE = "general1" as const;
const RESET_MESSAGE =
  "Clear the current mosaic and restore the default canvas? This can be undone.";

type ResetCanvasDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ResetCanvasDialog({ open, onConfirm, onCancel }: ResetCanvasDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const cancelVoiceRef = useRef<(() => void) | null>(null);
  const ownsVoiceRef = useRef(false);

  const stopDialogVoice = () => {
    cancelVoiceRef.current?.();
    cancelVoiceRef.current = null;
    if (ownsVoiceRef.current) {
      ownsVoiceRef.current = false;
      stopVoiceSound();
    }
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    stopDialogVoice();
  }, [open]);

  useEffect(() => {
    if (!open || !entered) return;
    if (!getProTipsVoiceAssist()) return;
    cancelVoiceRef.current?.();
    ownsVoiceRef.current = false;
    cancelVoiceRef.current = playUiSoundOnNextGesture(RESET_VOICE, () => {
      ownsVoiceRef.current = true;
    });
    return () => {
      cancelVoiceRef.current?.();
      cancelVoiceRef.current = null;
    };
  }, [open, entered]);

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
        stopDialogVoice();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, onCancel]);

  if (!mounted) return null;

  return (
    <div
      className={["modal-backdrop", entered ? "is-open" : ""].filter(Boolean).join(" ")}
      role="presentation"
      onClick={() => {
        playUiSound("close");
        stopDialogVoice();
        onCancel();
      }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        // The backdrop transitions background, not opacity — matching on
        // opacity never fires here and leaves the overlay mounted for good.
        if (!open && event.propertyName === "background-color") {
          setMounted(false);
        }
      }}
    >
      <div
        className="modal-dialog reset-canvas-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => event.stopPropagation()}
      >
        <TypewriterReveal
          as="h2"
          id={titleId}
          className="reset-canvas-dialog__title"
          text="Reset canvas"
          active={entered}
        />
        <TypewriterReveal
          as="p"
          id={descId}
          className="reset-canvas-dialog__message"
          text={RESET_MESSAGE}
          active={entered}
        />
        <div className="reset-canvas-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="panel-btn panel-btn--ghost"
            data-ui-sound="close"
            onClick={() => {
              stopDialogVoice();
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="panel-btn"
            data-ui-sound="canvasClear"
            onClick={() => {
              stopDialogVoice();
              onConfirm();
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
