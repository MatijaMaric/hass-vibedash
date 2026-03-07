import { useState } from "react";
import type { SavedDashboard } from "../hooks/useSavedDashboards";
import { ConfirmDialog } from "./ConfirmDialog";

interface SidebarProps {
  dashboards: SavedDashboard[];
  open: boolean;
  onToggle: () => void;
  onLoad: (dashboard: SavedDashboard) => void;
  onDelete: (id: string) => Promise<void>;
  activeDashboardId?: string | null;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Chevron-left icon */
function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** Trash icon */
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function DashboardItem({
  dashboard,
  isActive,
  onLoad,
  onDeleteClick,
}: {
  dashboard: SavedDashboard;
  isActive: boolean;
  onLoad: () => void;
  onDeleteClick: () => void;
}) {
  return (
    <button
      onClick={onLoad}
      className={`group flex w-full cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isActive
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:bg-muted"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground line-clamp-1">
          {dashboard.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick();
          }}
          className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label={`Delete ${dashboard.name}`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
        {dashboard.prompt}
      </span>
      <span className="mt-1 text-[11px] text-muted-foreground/60">
        {timeAgo(dashboard.created_at)}
      </span>
    </button>
  );
}

export function Sidebar({
  dashboards,
  open,
  onToggle,
  onLoad,
  onDelete,
  activeDashboardId,
}: SidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<SavedDashboard | null>(null);

  async function handleConfirmDelete() {
    if (deleteTarget) {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    }
  }

  // Sidebar content shared between desktop and mobile
  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Saved</h2>
          {dashboards.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {dashboards.length}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {dashboards.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            No saved dashboards yet. Generate one and hit save!
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {dashboards.map((d) => (
              <DashboardItem
                key={d.id}
                dashboard={d}
                isActive={d.id === activeDashboardId}
                onLoad={() => onLoad(d)}
                onDeleteClick={() => setDeleteTarget(d)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar: inline, collapsible */}
      <div
        className={`hidden border-r border-border bg-background transition-all duration-200 md:block ${
          open ? "w-[280px] min-w-[280px]" : "w-0 min-w-0 overflow-hidden"
        }`}
      >
        {open && sidebarContent}
      </div>

      {/* Desktop collapsed toggle button */}
      {!open && (
        <button
          onClick={onToggle}
          className="hidden h-full w-10 cursor-pointer items-center justify-center border-r border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          aria-label="Open sidebar"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      )}

      {/* Mobile overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={onToggle} />
          {/* Drawer */}
          <div className="absolute inset-y-0 left-0 w-[280px] bg-background shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Dashboard"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
