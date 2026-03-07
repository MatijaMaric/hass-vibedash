import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { catalog } from "./catalog";
import { HAChart } from "./components/HAChart";
import { HAMetric } from "./components/HAMetric";
import { HAGauge } from "./components/HAGauge";
import { HAEntityList } from "./components/HAEntityList";
import { HAMarkdown } from "./components/HAMarkdown";
import { HAMiniGraph } from "./components/HAMiniGraph";
import { GridItem } from "./components/GridItem";
import { Masonry } from "./components/Masonry";

/**
 * Registry mapping catalog component names to React implementations.
 * Combines shadcn built-in implementations with custom HA components.
 */
export const { registry } = defineRegistry(catalog, {
  components: {
    // shadcn built-in implementations (Stack overridden to default align=stretch)
    Card: shadcnComponents.Card,
    Stack: ({ props, children }) => {
      const isHorizontal = props.direction === "horizontal";
      const gapMap: Record<string, string> = {
        none: "gap-0",
        sm: "gap-2",
        md: "gap-3",
        lg: "gap-4",
      };
      const alignMap: Record<string, string> = {
        start: "items-start",
        center: "items-center",
        end: "items-end",
        stretch: "items-stretch",
      };
      const justifyMap: Record<string, string> = {
        start: "",
        center: "justify-center",
        end: "justify-end",
        between: "justify-between",
        around: "justify-around",
      };
      const gapClass = gapMap[props.gap ?? "md"] ?? "gap-3";
      const alignClass = alignMap[props.align ?? "stretch"] ?? "items-stretch";
      const justifyClass = justifyMap[props.justify ?? ""] ?? "";
      return (
        <div
          className={`flex ${isHorizontal ? "flex-row flex-wrap" : "flex-col"} ${gapClass} ${alignClass} ${justifyClass}`}
        >
          {children}
        </div>
      );
    },
    Grid: shadcnComponents.Grid,
    Heading: ({ props }) => {
      const level = props.level ?? "h2";
      const cls =
        level === "h1"
          ? "text-2xl font-bold"
          : level === "h3"
            ? "text-base font-semibold"
            : level === "h4"
              ? "text-sm font-semibold"
              : "text-lg font-semibold";
      const Tag = level as keyof JSX.IntrinsicElements;
      return (
        <Tag className={`${cls} px-1 text-left text-foreground`}>
          {props.text}
        </Tag>
      );
    },
    Text: shadcnComponents.Text,
    Badge: shadcnComponents.Badge,
    Separator: shadcnComponents.Separator,
    Alert: shadcnComponents.Alert,
    Progress: shadcnComponents.Progress,
    Table: shadcnComponents.Table,
    Tabs: shadcnComponents.Tabs,

    // Custom HA components
    HAChart,
    HAMetric,
    HAGauge,
    HAEntityList,
    HAMarkdown,
    HAMiniGraph,
    GridItem,
    Masonry,
  },
});
