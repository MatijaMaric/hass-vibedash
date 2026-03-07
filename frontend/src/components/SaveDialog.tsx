import { useState, type FormEvent, type KeyboardEvent } from "react";

interface SaveDialogProps {
  defaultName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SaveDialog({ defaultName, onSave, onCancel }: SaveDialogProps) {
  const [name, setName] = useState(defaultName);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h3 className="mb-4 text-lg font-semibold text-foreground">
          Save Dashboard
        </h3>
        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-sm text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="mb-6 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="My dashboard"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-default disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
