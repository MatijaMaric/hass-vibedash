import type { BaseComponentProps } from "@json-render/react";
import type { ReactNode } from "react";

interface GridItemProps {
  span?: number;
}

/**
 * Grid child wrapper that controls column span.
 * Use inside a Grid to make a child span multiple columns.
 */
export function GridItem({
  props,
  children,
}: BaseComponentProps<GridItemProps> & { children?: ReactNode }) {
  const spanMap: Record<number, string> = {
    1: "col-span-1",
    2: "col-span-2",
    3: "col-span-3",
    4: "col-span-4",
    5: "col-span-5",
    6: "col-span-6",
  };
  const n = Math.max(1, Math.min(6, props.span ?? 1));
  return <div className={spanMap[n]}>{children}</div>;
}
