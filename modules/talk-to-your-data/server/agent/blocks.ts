// Declarative "block" model shared by inline chat rendering and temporary pages.
// A block is a small JSON object describing one visual (kpi / chart / table / markdown)
// plus the read-only SQL that feeds it. The server resolves a block by running its SQL
// through the guard and attaching the resulting rows; the client renders it (no code from
// the model is ever executed). Pages store blocks WITHOUT data and re-resolve live on view.
//
// ── TEMPLATE: fully generic. No edits needed. ──
import { runAgentSql } from "./sql-guard.js";

export type BlockKind = "kpi" | "kpis" | "chart" | "table" | "markdown";

export interface Block {
  kind: BlockKind;
  title?: string;
  // sql-backed blocks
  sql?: string;
  // kpi
  valueKey?: string;
  format?: "int" | "usd" | "pct" | "text";
  glow?: "blue" | "green" | "purple" | "amber" | "red";
  subtitle?: string;
  // kpis (multi-card from one row)
  cards?: { label: string; valueKey: string; format?: Block["format"]; glow?: Block["glow"] }[];
  // chart
  chartType?: "bar" | "line" | "composed" | "pie";
  xKey?: string;
  series?: { key: string; label?: string; color?: string }[];
  height?: number;
  // table
  columns?: { key: string; label?: string; format?: Block["format"]; align?: "left" | "right" }[];
  // markdown
  md?: string;
}

export interface ResolvedBlock extends Block {
  data: Record<string, unknown>[] | Record<string, unknown> | null;
  rowCount: number;
  error?: string;
}

/** Light structural validation. Throws on clearly-malformed blocks. */
export function validateBlock(b: any): Block {
  if (!b || typeof b !== "object") throw new Error("block must be an object");
  const kind = b.kind;
  if (!["kpi", "kpis", "chart", "table", "markdown"].includes(kind)) throw new Error(`bad block kind: ${kind}`);
  if (kind !== "markdown" && (!b.sql || typeof b.sql !== "string")) throw new Error(`block kind '${kind}' requires sql`);
  if (kind === "chart" && (!b.chartType || !b.xKey || !Array.isArray(b.series) || !b.series.length))
    throw new Error("chart block requires chartType, xKey, series[]");
  if (kind === "table" && (!Array.isArray(b.columns) || !b.columns.length)) throw new Error("table block requires columns[]");
  if (kind === "kpi" && !b.valueKey) throw new Error("kpi block requires valueKey");
  if (kind === "kpis" && (!Array.isArray(b.cards) || !b.cards.length)) throw new Error("kpis block requires cards[]");
  if (kind === "markdown" && !b.md) throw new Error("markdown block requires md");
  return b as Block;
}

/** Run a block's SQL (if any) and attach data. Used for inline render + page view. */
export async function resolveBlock(b: Block, maxRows = 2000): Promise<ResolvedBlock> {
  if (b.kind === "markdown" || !b.sql) return { ...b, data: null, rowCount: 0 };
  try {
    const res = await runAgentSql(b.sql, maxRows);
    const data = b.kind === "kpi" || b.kind === "kpis" ? res.rows[0] ?? {} : res.rows;
    return { ...b, data, rowCount: res.rowCount };
  } catch (e: any) {
    return { ...b, data: null, rowCount: 0, error: String(e?.message ?? e) };
  }
}

export async function resolveBlocks(blocks: Block[], maxRows = 2000): Promise<ResolvedBlock[]> {
  return Promise.all(blocks.map((b) => resolveBlock(b, maxRows)));
}
