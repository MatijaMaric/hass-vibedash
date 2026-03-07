import { useCallback, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

export interface DashboardSpec {
  root: string;
  elements: Record<string, unknown>;
}

interface ElementData {
  type?: string;
  props?: Record<string, unknown>;
  children?: string[];
}

export interface EditableContainer {
  containerId: string;
  containerType: string;
  childIds: string[];
}

function getElement(spec: DashboardSpec, id: string): ElementData {
  return (spec.elements[id] ?? {}) as ElementData;
}

/** Collect an element and all its descendants recursively. */
function collectDescendants(spec: DashboardSpec, id: string): string[] {
  const ids = [id];
  const el = getElement(spec, id);
  if (el.children) {
    for (const childId of el.children) {
      ids.push(...collectDescendants(spec, childId));
    }
  }
  return ids;
}

/** Find the parent element that has `childId` in its children array. */
function findParent(
  spec: DashboardSpec,
  childId: string,
): string | null {
  for (const [id, raw] of Object.entries(spec.elements)) {
    const el = raw as ElementData;
    if (el.children?.includes(childId)) return id;
  }
  return null;
}

const CONTAINER_TYPES = new Set(["Stack", "Grid", "Masonry"]);

/** Walk the spec tree and return all containers with their direct children. */
export function getEditableContainers(
  spec: DashboardSpec,
): EditableContainer[] {
  const containers: EditableContainer[] = [];
  const rootEl = getElement(spec, spec.root);
  if (!rootEl.children?.length) return containers;

  // Root stack is a container for top-level reordering
  containers.push({
    containerId: spec.root,
    containerType: rootEl.type ?? "Stack",
    childIds: [...rootEl.children],
  });

  // Also add nested containers (e.g., Masonry/Grid inside root Stack)
  for (const childId of rootEl.children) {
    const child = getElement(spec, childId);
    if (child.type && CONTAINER_TYPES.has(child.type) && child.children?.length) {
      containers.push({
        containerId: childId,
        containerType: child.type,
        childIds: [...child.children],
      });
    }
  }

  return containers;
}

/** Remove an element from the spec, including all descendants. */
export function removeElement(
  spec: DashboardSpec,
  elementId: string,
): DashboardSpec {
  const parentId = findParent(spec, elementId);
  if (!parentId) return spec;

  const idsToRemove = new Set(collectDescendants(spec, elementId));
  const newElements = { ...spec.elements };

  // Remove from parent's children
  const parent = { ...(newElements[parentId] as ElementData) };
  parent.children = parent.children?.filter((id) => id !== elementId);
  newElements[parentId] = parent;

  // Remove element and all descendants
  for (const id of idsToRemove) {
    delete newElements[id];
  }

  return { ...spec, elements: newElements };
}

/** Reorder children within a container. */
export function moveElement(
  spec: DashboardSpec,
  parentId: string,
  fromIndex: number,
  toIndex: number,
): DashboardSpec {
  const parent = getElement(spec, parentId);
  if (!parent.children) return spec;

  const newChildren = arrayMove(parent.children, fromIndex, toIndex);
  const newElements = {
    ...spec.elements,
    [parentId]: { ...parent, children: newChildren },
  };

  return { ...spec, elements: newElements };
}

export function useEditMode() {
  const [isEditing, setIsEditing] = useState(false);
  const [editSpec, setEditSpec] = useState<DashboardSpec | null>(null);
  const [originalSpec, setOriginalSpec] = useState<DashboardSpec | null>(null);

  const enterEditMode = useCallback((spec: DashboardSpec) => {
    const clone = JSON.parse(JSON.stringify(spec)) as DashboardSpec;
    setOriginalSpec(clone);
    setEditSpec(clone);
    setIsEditing(true);
  }, []);

  const applyEdits = useCallback((): DashboardSpec | null => {
    const result = editSpec;
    setIsEditing(false);
    setEditSpec(null);
    setOriginalSpec(null);
    return result;
  }, [editSpec]);

  const cancelEdits = useCallback(() => {
    setIsEditing(false);
    setEditSpec(null);
    setOriginalSpec(null);
  }, []);

  const handleRemoveElement = useCallback((elementId: string) => {
    setEditSpec((prev) => (prev ? removeElement(prev, elementId) : null));
  }, []);

  const handleMoveElement = useCallback(
    (parentId: string, fromIndex: number, toIndex: number) => {
      setEditSpec((prev) =>
        prev ? moveElement(prev, parentId, fromIndex, toIndex) : null,
      );
    },
    [],
  );

  const hasChanges =
    isEditing &&
    editSpec !== null &&
    originalSpec !== null &&
    JSON.stringify(editSpec) !== JSON.stringify(originalSpec);

  return {
    isEditing,
    editSpec,
    hasChanges,
    enterEditMode,
    applyEdits,
    cancelEdits,
    removeElement: handleRemoveElement,
    moveElement: handleMoveElement,
  };
}
