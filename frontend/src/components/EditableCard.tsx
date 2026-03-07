import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

interface EditableCardProps {
  elementId: string;
  onRemove: (id: string) => void;
  children: ReactNode;
}

export function EditableCard({
  elementId,
  onRemove,
  children,
}: EditableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: elementId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/edit relative">
      {/* Edit overlay controls — visible on hover */}
      <div className="pointer-events-none absolute inset-0 z-10 rounded-xl border-2 border-dashed border-transparent transition-colors group-hover/edit:border-primary/40" />

      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 flex h-8 w-8 cursor-grab items-center justify-center rounded-lg bg-background/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground active:cursor-grabbing group-hover/edit:opacity-100"
        aria-label="Drag to reorder"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      {/* Delete button */}
      <button
        onClick={() => onRemove(elementId)}
        className="absolute top-2 right-2 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-destructive/90 text-destructive-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-destructive group-hover/edit:opacity-100"
        aria-label="Remove card"
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

      {/* Card content */}
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  );
}
