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
    // shadcn built-in implementations
    Card: shadcnComponents.Card,
    Stack: shadcnComponents.Stack,
    Grid: shadcnComponents.Grid,
    Heading: shadcnComponents.Heading,
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
