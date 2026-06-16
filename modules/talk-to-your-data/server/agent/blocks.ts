// Declarative "block" model shared by inline chat rendering and temporary pages.
// A block is a small JSON object describing one visual (kpi / chart / table / markdown)
// plus the read-only SQL that feeds it. The server resolves a block by running its SQL
// through the guard and attaching the resulting rows; the client renders it (no code from
// the model is ever executed). Pages store blocks WITHOUT data and re-resolve live on view.
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
  if (kind === "markdown" && !b.md) throw new Error("markdown block requires md");
  // chart/table/kpi/kpis presentation fields (chartType, xKey, series, columns, valueKey, cards) are
  // OPTIONAL — if the model omits them they're inferred from the SQL result columns in resolveBlock.
  // This makes a block reliably producible from just {kind, sql} (cheap models can't fill full specs).
  return b as Block;
}

function isNumericVal(v: any): boolean {
  if (typeof v === "number") return true;
  if (typeof v === "string") { const s = v.replace(/[$,%\s]/g, ""); return s !== "" && !Number.isNaN(Number(s)); }
  return false;
}

/** Fill any presentation fields the model omitted, inferring from the actual result columns. */
function inferSpec(b: Block, rows: Record<string, any>[]): Block {
  const row0 = rows[0] ?? {};
  const keys = Object.keys(row0);
  if (!keys.length) return b;
  const numKeys = keys.filter((k) => isNumericVal(row0[k]));
  const strKeys = keys.filter((k) => !numKeys.includes(k));
  const out: any = { ...b };
  if (b.kind === "chart") {
    if (!out.xKey) out.xKey = strKeys[0] ?? keys[0];
    if (!Array.isArray(out.series) || !out.series.length) {
      const s = numKeys.filter((k) => k !== out.xKey);
      out.series = (s.length ? s : keys.filter((k) => k !== out.xKey)).map((k) => ({ key: k }));
    }
    if (!out.chartType) out.chartType = /date|month|day|year|week|time|created|_on|period/i.test(String(out.xKey)) ? "line" : "bar";
  } else if (b.kind === "table") {
    if (!Array.isArray(out.columns) || !out.columns.length) out.columns = keys.map((k) => ({ key: k }));
  } else if (b.kind === "kpi") {
    if (!out.valueKey) out.valueKey = numKeys[0] ?? keys[0];
  } else if (b.kind === "kpis") {
    if (!Array.isArray(out.cards) || !out.cards.length) {
      const ck = (numKeys.length ? numKeys : keys).slice(0, 6);
      out.cards = ck.map((k) => ({ label: k, valueKey: k }));
    }
  }
  return out;
}

/** Run a block's SQL (if any), infer any missing presentation spec, and attach data. */
export async function resolveBlock(b: Block, maxRows = 2000): Promise<ResolvedBlock> {
  if (b.kind === "markdown" || !b.sql) return { ...b, data: null, rowCount: 0 };
  try {
    const res = await runAgentSql(b.sql, maxRows);
    const spec = inferSpec(b, res.rows);
    const data = spec.kind === "kpi" || spec.kind === "kpis" ? res.rows[0] ?? {} : res.rows;
    return { ...spec, data, rowCount: res.rowCount };
  } catch (e: any) {
    return { ...b, data: null, rowCount: 0, error: String(e?.message ?? e) };
  }
}

export async function resolveBlocks(blocks: Block[], maxRows = 2000): Promise<ResolvedBlock[]> {
  return Promise.all(blocks.map((b) => resolveBlock(b, maxRows)));
}
