// Declarative block model (mirror of server/agent/blocks.ts). The agent emits these; the
// page-renderer renders them. `data` is attached by the server (resolved from each block's
// read-only SQL) for both inline chat blocks and temp-page views.
//
// ── TEMPLATE: fully generic. Keep in sync with server/agent/blocks.ts. ──
export type BlockKind = "kpi" | "kpis" | "chart" | "table" | "markdown";
export type ValueFormat = "int" | "usd" | "pct" | "text";
export type Glow = "blue" | "green" | "purple" | "amber" | "red";

export interface Block {
  kind: BlockKind;
  title?: string;
  sql?: string;
  // kpi
  valueKey?: string;
  format?: ValueFormat;
  glow?: Glow;
  subtitle?: string;
  // kpis
  cards?: { label: string; valueKey: string; format?: ValueFormat; glow?: Glow }[];
  // chart
  chartType?: "bar" | "line" | "composed" | "pie";
  xKey?: string;
  series?: { key: string; label?: string; color?: string }[];
  height?: number;
  // table
  columns?: { key: string; label?: string; format?: ValueFormat; align?: "left" | "right" }[];
  // markdown
  md?: string;
}

export interface ResolvedBlock extends Block {
  data: Record<string, unknown>[] | Record<string, unknown> | null;
  rowCount: number;
  error?: string;
}
