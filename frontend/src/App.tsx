import { useCallback, useState } from "react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "./registry";
import { useCallWS, useSubscribeMessage } from "./hooks/useHass";
import { PromptBar, EmptyState, LoadingState } from "./components/PromptBar";

interface DashboardSpec {
  root: string;
  elements: Record<string, unknown>;
}

interface StreamEvent {
  stage: "entity_selection" | "dashboard_generation" | "streaming" | "complete";
  message?: string;
  entity_count?: number;
  streaming?: boolean;
  chunk?: string;
  accumulated?: string;
  dashboard?: DashboardSpec;
}

const MAX_HISTORY = 5;

export function App() {
  const callWS = useCallWS();
  const subscribeMessage = useSubscribeMessage();
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      setLoading(true);
      setError(null);
      setProgressMessage("Starting...");
      setStreamingText(null);

      try {
        // Try the streaming endpoint first
        const dashboard = await new Promise<DashboardSpec>((resolve, reject) => {
          let resolved = false;

          subscribeMessage<StreamEvent>(
            (event) => {
              switch (event.stage) {
                case "entity_selection":
                  setProgressMessage(
                    event.message || "Analyzing your request...",
                  );
                  break;

                case "dashboard_generation":
                  setProgressMessage(
                    event.message || "Generating dashboard...",
                  );
                  break;

                case "streaming":
                  if (event.accumulated) {
                    setStreamingText(event.accumulated);
                    setProgressMessage("Generating dashboard...");
                  }
                  break;

                case "complete":
                  if (event.dashboard && !resolved) {
                    resolved = true;
                    resolve(event.dashboard);
                  }
                  break;
              }
            },
            { type: "vibedash/generate_stream", prompt },
          ).catch((err: unknown) => {
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          });
        });

        setSpec(dashboard);
        setHistory((prev) => {
          const next = [prompt, ...prev.filter((p) => p !== prompt)];
          return next.slice(0, MAX_HISTORY);
        });
      } catch (err: unknown) {
        // Fall back to non-streaming generate if streaming isn't available
        try {
          setProgressMessage("Generating dashboard...");
          setStreamingText(null);
          const result = await callWS<{ dashboard: DashboardSpec }>({
            type: "vibedash/generate",
            prompt,
          });
          setSpec(result.dashboard);
          setHistory((prev) => {
            const next = [prompt, ...prev.filter((p) => p !== prompt)];
            return next.slice(0, MAX_HISTORY);
          });
        } catch (fallbackErr: unknown) {
          const message =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : "Failed to generate dashboard";
          setError(message);
        }
      } finally {
        setLoading(false);
        setProgressMessage(null);
        setStreamingText(null);
      }
    },
    [callWS, subscribeMessage],
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

        {loading && (
          <LoadingState
            message={progressMessage}
            streamingText={streamingText}
          />
        )}

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
