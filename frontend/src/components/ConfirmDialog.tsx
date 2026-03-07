interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
        <p className="mb-6 text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="cursor-pointer rounded-lg bg-destructive px-4 py-2 text-sm text-white transition-colors hover:bg-destructive/80"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
