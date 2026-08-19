import { playUiSound } from "../ui/sounds";
import { TypewriterReveal } from "./TypewriterReveal";

type ImportErrorDialogProps = {
  title?: string;
  message: string;
  onDismiss: () => void;
};

export function ImportErrorDialog({
  title = "Couldn't import file",
  message,
  onDismiss,
}: ImportErrorDialogProps) {
  return (
    <div
      className="import-error-backdrop"
      role="presentation"
      onClick={() => {
        playUiSound("close");
        onDismiss();
      }}
    >
      <div
        className="import-error-dialog"
        role="alertdialog"
        aria-labelledby="import-error-title"
        aria-describedby="import-error-message"
        onClick={(event) => event.stopPropagation()}
      >
        <TypewriterReveal
          as="h2"
          id="import-error-title"
          className="import-error-dialog__title"
          text={title}
        />
        <TypewriterReveal
          as="p"
          id="import-error-message"
          className="import-error-dialog__message"
          text={message}
          caret
        />
        <button
          type="button"
          className="panel-btn import-error-dialog__button"
          data-ui-sound="close"
          onClick={onDismiss}
        >
          OK
        </button>
      </div>
    </div>
  );
}
