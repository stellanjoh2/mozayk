type ImportErrorDialogProps = {
  message: string;
  onDismiss: () => void;
};

export function ImportErrorDialog({ message, onDismiss }: ImportErrorDialogProps) {
  return (
    <div
      className="import-error-backdrop"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="import-error-dialog"
        role="alertdialog"
        aria-labelledby="import-error-title"
        aria-describedby="import-error-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="import-error-title" className="import-error-dialog__title">
          Image type not supported
        </h2>
        <p id="import-error-message" className="import-error-dialog__message">
          {message}
        </p>
        <button
          type="button"
          className="panel-btn import-error-dialog__button"
          onClick={onDismiss}
        >
          OK
        </button>
      </div>
    </div>
  );
}
