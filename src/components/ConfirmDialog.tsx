import { useEffect, useId, useRef, useState } from "react";
import { getProTipsVoiceAssist } from "../ui/proTips";
import {
  playUiSound,
  playUiSoundOnNextGesture,
  stopVoiceSound,
  type UiSound,
  type VoiceSound,
} from "../ui/sounds";
import { TypewriterReveal } from "./TypewriterReveal";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmSound?: UiSound;
  /** Spoken message when Voice Assist is on. */
  voice?: VoiceSound;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmSound = "ok",
  voice,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
    if (!open || !entered || !voice) return;
    if (!getProTipsVoiceAssist()) return;
    cancelVoiceRef.current?.();
    ownsVoiceRef.current = false;
    cancelVoiceRef.current = playUiSoundOnNextGesture(voice, () => {
      ownsVoiceRef.current = true;
    });
    return () => {
      cancelVoiceRef.current?.();
      cancelVoiceRef.current = null;
    };
  }, [open, entered, voice]);

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
          text={title}
          active={entered}
          caret
        />
        <TypewriterReveal
          as="p"
          id={descId}
          className="reset-canvas-dialog__message"
          text={message}
          active={entered}
          caret
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
            {cancelLabel}
          </button>
          <button
            type="button"
            className="panel-btn"
            data-ui-sound={confirmSound}
            onClick={() => {
              stopDialogVoice();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
