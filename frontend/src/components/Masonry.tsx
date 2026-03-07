import type { BaseComponentProps } from "@json-render/react";
import type { ReactNode } from "react";

interface MasonryProps {
  columns?: number;
  gap?: string;
}

const gapValues: Record<string, string> = {
  sm: "0.75rem",
  md: "1.5rem",
  lg: "2rem",
};

/**
 * Masonry layout using CSS multi-column.
 * Cards of varying heights pack tightly without vertical gaps.
 */
export function Masonry({
  props,
  children,
}: BaseComponentProps<MasonryProps> & { children?: ReactNode }) {
  const colsMap: Record<number, string> = {
    2: "columns-2",
    3: "columns-3",
    4: "columns-4",
  };
  const n = Math.max(2, Math.min(4, props.columns ?? 3));
  const cols = colsMap[n] ?? "columns-3";
  const gap = gapValues[props.gap ?? "md"] ?? "0.75rem";

  return (
    <div
      className={`${cols} [&>*]:mb-6 [&>*]:break-inside-avoid`}
      style={{ columnGap: gap }}
    >
      {children}
    </div>
  );
}
