import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

/**
 * Custom Home Assistant component definitions for the json-render catalog.
 * These are the HA-specific components the LLM can generate.
 */
const haComponentDefinitions = {
  HAChart: {
    props: z.object({
      title: z.string().describe("Chart title"),
      chartType: z
        .enum(["line", "bar", "area"])
        .default("line")
        .describe("Chart visualization type"),
      entities: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("Array of Home Assistant entity_ids to plot"),
      timeRange: z
        .enum(["1h", "6h", "24h", "7d", "30d"])
        .default("24h")
        .describe("Time range for history data"),
    }),
    slots: [] as string[],
    description:
      "Time-series chart showing entity history. Use for trends, comparisons, and historical data visualization.",
  },

  HAMetric: {
    props: z.object({
      title: z.string().describe("Metric label"),
      entity: z.string().describe("Single Home Assistant entity_id"),
    }),
    slots: [] as string[],
    description:
      "Large number display showing the current state of a single entity. Use for temperature, power, counts, etc.",
  },

  HAGauge: {
    props: z.object({
      title: z.string().describe("Gauge label"),
      entity: z.string().describe("Single Home Assistant entity_id"),
      min: z.number().default(0).describe("Minimum value"),
      max: z.number().default(100).describe("Maximum value"),
    }),
    slots: [] as string[],
    description:
      "Semicircle gauge for bounded numeric values. Use for battery %, humidity %, CPU usage, etc.",
  },

  HAEntityList: {
    props: z.object({
      title: z.string().describe("List title"),
      entities: z
        .array(z.string())
        .min(1)
        .describe("Array of Home Assistant entity_ids to display"),
      timeRange: z
        .enum(["1h", "6h", "24h", "7d", "30d"])
        .optional()
        .describe("If set, shows value change over this time range"),
    }),
    slots: [] as string[],
    description:
      "Table of entities showing friendly name and current state. Optionally shows change over a time range.",
  },

  HAMarkdown: {
    props: z.object({
      title: z.string().describe("Card title"),
      content: z
        .string()
        .describe("Markdown text content with analysis or summary"),
    }),
    slots: [] as string[],
    description:
      "Markdown text card for analysis, summaries, or explanatory text about dashboard data.",
  },
} as const;

/**
 * Select relevant shadcn components for dashboard layouts.
 * We intentionally exclude form/interactive components since dashboards are read-only.
 */
const selectedShadcnDefs = {
  Card: shadcnComponentDefinitions.Card,
  Stack: shadcnComponentDefinitions.Stack,
  Grid: shadcnComponentDefinitions.Grid,
  Heading: shadcnComponentDefinitions.Heading,
  Text: shadcnComponentDefinitions.Text,
  Badge: shadcnComponentDefinitions.Badge,
  Separator: shadcnComponentDefinitions.Separator,
  Alert: shadcnComponentDefinitions.Alert,
  Progress: shadcnComponentDefinitions.Progress,
  Table: shadcnComponentDefinitions.Table,
  Tabs: shadcnComponentDefinitions.Tabs,
} as const;

export const catalog = defineCatalog(schema, {
  components: {
    ...selectedShadcnDefs,
    ...haComponentDefinitions,
  },
});

export type VibeDashCatalog = typeof catalog;
