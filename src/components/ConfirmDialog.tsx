import { useEffect, useId, useRef, useState } from "react";
import { playUiSound, type UiSound } from "../ui/sounds";
import { TypewriterReveal } from "./TypewriterReveal";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmSound?: UiSound;
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
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

  if (!mounted) return null;

  return (
    <div
      className={["modal-backdrop", entered ? "is-open" : ""].filter(Boolean).join(" ")}
      role="presentation"
      onClick={() => {
        playUiSound("close");
        onCancel();
      }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!open && event.propertyName === "opacity") setMounted(false);
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
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="panel-btn"
            data-ui-sound={confirmSound}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
