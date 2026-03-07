import { useState, type FormEvent, type KeyboardEvent } from "react";

interface PromptBarProps {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  history: string[];
  onSave?: () => void;
  canSave?: boolean;
  onToggleSidebar?: () => void;
}

const SUGGESTIONS = [
  "Show me an energy dashboard",
  "What's the climate like in my home?",
  "Show all battery levels",
  "Give me a security overview",
];

export function PromptBar({
  onSubmit,
  loading,
  history,
  onSave,
  canSave,
  onToggleSidebar,
}: PromptBarProps) {
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;
    onSubmit(prompt);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 py-3">
        {/* Brand + Input Row */}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          {/* Mobile sidebar toggle */}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Toggle saved dashboards"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          <div className="flex items-center gap-2 text-primary">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 fill-current"
              aria-hidden="true"
            >
              <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
            </svg>
            <span className="hidden text-base font-semibold sm:inline">
              VibeDash
            </span>
          </div>

          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-card px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your dashboard..."
              disabled={loading}
              className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 cursor-pointer rounded-full bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-default disabled:opacity-40"
              aria-label="Generate dashboard"
            >
              {loading ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="60 30"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14m-6-6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Save button */}
          {onSave && canSave && (
            <button
              type="button"
              onClick={onSave}
              className="shrink-0 cursor-pointer rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              aria-label="Save dashboard"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path
                  d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </form>

        {/* History chips */}
        {history.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {history.map((prompt, i) => (
              <button
                key={i}
                onClick={() => onSubmit(prompt)}
                disabled={loading}
                className="shrink-0 cursor-pointer rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
              >
                {prompt.length > 40 ? prompt.slice(0, 40) + "..." : prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-6 text-primary">
        <svg
          viewBox="0 0 24 24"
          className="h-12 w-12 fill-current opacity-40"
          aria-hidden="true"
        >
          <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-foreground">
        What would you like to see?
      </h2>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        Describe a dashboard and AI will create it from your smart home data.
      </p>
      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestionClick(suggestion)}
            className="cursor-pointer rounded-xl bg-card p-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

interface LoadingStateProps {
  message?: string | null;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-4 flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {message || "Generating your dashboard..."}
      </p>
    </div>
  );
}
