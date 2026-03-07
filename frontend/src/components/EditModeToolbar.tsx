interface EditModeToolbarProps {
  onDone: () => void;
  onCancel: () => void;
  hasChanges: boolean;
}

export function EditModeToolbar({
  onDone,
  onCancel,
  hasChanges,
}: EditModeToolbarProps) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-sm">
      <span className="text-sm text-muted-foreground">Edit mode</span>

      <div className="h-4 w-px bg-border" />

      <button
        onClick={onCancel}
        className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 18L18 6M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Cancel
      </button>

      <button
        onClick={onDone}
        disabled={!hasChanges}
        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-default disabled:opacity-40"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Done
      </button>
    </div>
  );
}
