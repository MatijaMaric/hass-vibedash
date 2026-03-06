import { useCallback, useState } from "react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "./registry";
import { useCallWS } from "./hooks/useHass";
import { PromptBar, EmptyState, LoadingState } from "./components/PromptBar";

interface DashboardSpec {
  root: string;
  elements: Record<string, unknown>;
}

interface GenerateResult {
  dashboard: DashboardSpec;
}

const MAX_HISTORY = 5;

export function App() {
  const callWS = useCallWS();
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await callWS<GenerateResult>({
          type: "vibedash/generate",
          prompt,
        });

        setSpec(result.dashboard);
        setHistory((prev) => {
          const next = [prompt, ...prev.filter((p) => p !== prompt)];
          return next.slice(0, MAX_HISTORY);
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to generate dashboard";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [callWS],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <PromptBar onSubmit={handleSubmit} loading={loading} history={history} />

      <main className="flex flex-1 flex-col overflow-y-auto">
        {error && (
          <div className="mx-auto max-w-screen-xl px-4 pt-4">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto cursor-pointer text-destructive hover:text-destructive/80"
                aria-label="Dismiss error"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {loading && <LoadingState />}

        {!loading && !spec && !error && (
          <EmptyState onSuggestionClick={handleSubmit} />
        )}

        {!loading && spec && (
          <div className="mx-auto max-w-screen-xl px-6 py-6">
            <JSONUIProvider registry={registry}>
              <Renderer spec={spec} registry={registry} />
            </JSONUIProvider>
          </div>
        )}
      </main>
    </div>
  );
}
