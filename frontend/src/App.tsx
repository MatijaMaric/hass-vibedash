import { useCallback, useMemo, useRef, useState } from "react";
import { createSpecStreamCompiler } from "@json-render/core";
import { Renderer, JSONUIProvider } from "@json-render/react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { registry } from "./registry";
import { useCallWS, useSubscribeMessage } from "./hooks/useHass";
import { PromptBar, EmptyState, LoadingState } from "./components/PromptBar";
import { Sidebar } from "./components/Sidebar";
import { SaveDialog } from "./components/SaveDialog";
import { EditableCard } from "./components/EditableCard";
import { EditModeToolbar } from "./components/EditModeToolbar";
import { useSavedDashboards } from "./hooks/useSavedDashboards";
import {
  useEditMode,
  getEditableContainers,
  type DashboardSpec,
} from "./hooks/useEditMode";

interface StreamEvent {
  stage: "entity_selection" | "dashboard_generation" | "streaming" | "complete";
  message?: string;
  entity_count?: number;
  streaming?: boolean;
  chunk?: string;
  dashboard?: DashboardSpec;
}

const MAX_HISTORY = 5;

function StreamingIndicator() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full w-1/3 rounded-full bg-primary"
          style={{
            animation: "streaming-shimmer 1.5s ease-in-out infinite",
          }}
        />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        Generating...
      </span>
    </div>
  );
}

/** Render a single container's children as sortable editable cards. */
function EditableContainer({
  containerId,
  containerType,
  childIds,
  spec,
  onRemove,
  onDragEnd,
}: {
  containerId: string;
  containerType: string;
  childIds: string[];
  spec: DashboardSpec;
  onRemove: (id: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{containerType}</span>
        <span>&middot;</span>
        <span>
          {childIds.length} {childIds.length === 1 ? "item" : "items"}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={childIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4">
            {childIds.map((childId) => (
              <EditableCard
                key={childId}
                elementId={childId}
                onRemove={onRemove}
              >
                <JSONUIProvider registry={registry}>
                  <Renderer
                    spec={{ root: childId, elements: spec.elements }}
                    registry={registry}
                  />
                </JSONUIProvider>
              </EditableCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function App() {
  const callWS = useCallWS();
  const subscribeMessage = useSubscribeMessage();
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [streamingSpec, setStreamingSpec] = useState<DashboardSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(
    null,
  );
  const compilerRef = useRef<ReturnType<
    typeof createSpecStreamCompiler
  > | null>(null);

  const { dashboards, saveDashboard, deleteDashboard } =
    useSavedDashboards();

  const editMode = useEditMode();

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (editMode.isEditing) return;
      setLoading(true);
      setError(null);
      setSpec(null);
      setStreamingSpec(null);
      setProgressMessage("Starting...");
      setCurrentPrompt(prompt);
      setActiveDashboardId(null);
      compilerRef.current = null;

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
                  if (event.streaming) {
                    compilerRef.current = createSpecStreamCompiler();
                  }
                  break;

                case "streaming":
                  if (event.chunk && compilerRef.current) {
                    const { result, newPatches } =
                      compilerRef.current.push(event.chunk);
                    if (
                      newPatches.length > 0 &&
                      result &&
                      (result as DashboardSpec).root &&
                      (result as DashboardSpec).elements
                    ) {
                      setStreamingSpec({ ...(result as DashboardSpec) });
                    }
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
        setStreamingSpec(null);
        compilerRef.current = null;
      }
    },
    [callWS, subscribeMessage, editMode.isEditing],
  );

  const handleEnterEditMode = useCallback(() => {
    if (spec) editMode.enterEditMode(spec);
  }, [spec, editMode.enterEditMode]);

  const handleApplyEdits = useCallback(() => {
    const edited = editMode.applyEdits();
    if (edited) setSpec(edited);
  }, [editMode.applyEdits]);

  const handleDragEnd = useCallback(
    (containerId: string) => (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !editMode.editSpec) return;

      const el = editMode.editSpec.elements[containerId] as {
        children?: string[];
      };
      const children = el?.children;
      if (!children) return;

      const fromIndex = children.indexOf(active.id as string);
      const toIndex = children.indexOf(over.id as string);
      if (fromIndex === -1 || toIndex === -1) return;

      editMode.moveElement(containerId, fromIndex, toIndex);
    },
    [editMode.editSpec, editMode.moveElement],
  );

  const displaySpec = spec ?? streamingSpec;
  const isStreaming = loading && streamingSpec !== null;
  const showFullLoading = loading && !streamingSpec;

  const editContainers = useMemo(
    () =>
      editMode.isEditing && editMode.editSpec
        ? getEditableContainers(editMode.editSpec)
        : [],
    [editMode.isEditing, editMode.editSpec],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <PromptBar
        onSubmit={handleSubmit}
        loading={loading}
        history={history}
        onSave={() => setShowSaveDialog(true)}
        canSave={!!spec && !loading && !editMode.isEditing}
        onEdit={handleEnterEditMode}
        canEdit={!!spec && !loading && !editMode.isEditing}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          dashboards={dashboards}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((prev) => !prev)}
          onLoad={(saved) => {
            if (editMode.isEditing) return;
            setSpec(saved.dashboard);
            setCurrentPrompt(saved.prompt);
            setActiveDashboardId(saved.id);
            setError(null);
            setSidebarOpen(false);
          }}
          onDelete={deleteDashboard}
          activeDashboardId={activeDashboardId}
        />

        <main className="flex flex-1 flex-col overflow-y-auto">
          {error && (
            <div className="w-full px-4 pt-4 md:px-8 md:pt-8">
              <div className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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

          {showFullLoading && <LoadingState message={progressMessage} />}

          {/* Edit mode view */}
          {editMode.isEditing && editMode.editSpec && (
            <div className="w-full px-4 py-4 md:px-8 md:py-8 pb-24">
              <div className="flex flex-col gap-6">
                {editContainers.map((container) => (
                  <EditableContainer
                    key={container.containerId}
                    containerId={container.containerId}
                    containerType={container.containerType}
                    childIds={container.childIds}
                    spec={editMode.editSpec!}
                    onRemove={editMode.removeElement}
                    onDragEnd={handleDragEnd(container.containerId)}
                  />
                ))}
              </div>
              <EditModeToolbar
                onDone={handleApplyEdits}
                onCancel={editMode.cancelEdits}
                hasChanges={editMode.hasChanges}
              />
            </div>
          )}

          {/* Normal view */}
          {!editMode.isEditing && displaySpec && (
            <div className="w-full px-4 py-4 md:px-8 md:py-8">
              {isStreaming && <StreamingIndicator />}
              <JSONUIProvider registry={registry}>
                <Renderer spec={displaySpec} registry={registry} />
              </JSONUIProvider>
            </div>
          )}

          {!loading && !displaySpec && !error && !editMode.isEditing && (
            <EmptyState onSuggestionClick={handleSubmit} />
          )}
        </main>
      </div>

      {showSaveDialog && spec && currentPrompt && (
        <SaveDialog
          defaultName={currentPrompt.slice(0, 50)}
          onSave={async (name) => {
            await saveDashboard(name, currentPrompt, spec);
            setShowSaveDialog(false);
          }}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
