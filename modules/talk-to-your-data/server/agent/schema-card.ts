// ════════════════════════════════════════════════════════════════════════════
//  THE SCHEMA CARD — the single most important file you customize per app.
// ════════════════════════════════════════════════════════════════════════════
// This is a compact, hand-curated description of YOUR data that rides in the system prompt on
// every request. It is the token-efficient substitute for dumping information_schema: it tells
// the agent which tables to use, the columns that matter, and the critical gotchas (e.g. "money
// is stored as TEXT", odd date formats, where contact info actually lives).
//
// A GOOD schema card is the difference between an agent that answers correctly and one that
// hallucinates column names or reports false "gaps". See SCHEMA-CARD-GUIDE.md for the checklist.
//
// The card is BACKED by live information_schema introspection (listTables/describeTable below),
// so the agent can always fetch authoritative table/column names and NEVER needs to ask the
// user. Keep the prose card tight; lean on introspection for exhaustive column lists.
import { query } from "../db.js";

// Tables the agent must NOT see/read (auth + its own bookkeeping + internal).
// __EDIT__: add any app-specific sensitive prefixes (e.g. users|billing|api_keys).
const RESTRICTED = /^(session|agent_chats|agent_pages|pg_|sql_)/i;

/** Live list of queryable public tables (restricted ones removed). */
export async function listTables(): Promise<string[]> {
  try {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    return rows.map((r) => r.table_name).filter((t) => !RESTRICTED.test(t));
  } catch { return []; }
}

/** Live column list (name + type) for one table — authoritative, from information_schema. */
export async function describeTable(table: string): Promise<string> {
  const t = String(table ?? "").trim();
  if (!/^[a-z_][a-z0-9_]*$/i.test(t) || RESTRICTED.test(t)) return `Unknown or restricted table: ${t}`;
  try {
    const cols = await query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position`, [t]);
    if (!cols.length) return `Table "${t}" not found. Use list_tables to see available tables.`;
    const colList = cols.map((c) => `${c.column_name} (${c.data_type})`).join(", ");
    const note = describeSchema(t) !== SCHEMA_CARD ? `\nNotes: ${describeSchema(t)}` : "";
    return `${t} columns: ${colList}${note}`;
  } catch (e: any) {
    return `Could not read columns for ${t}: ${String(e?.message ?? e)}`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ⬇️  REPLACE EVERYTHING IN THIS STRING WITH YOUR APP'S DATA.  ⬇️
//  The example below (kept as a reference) is for a generic e-commerce/orders DB.
//  Follow the section structure: CRITICAL RULES → WHICH TABLE? map → per-table columns →
//  derived concepts → DATA-LOCATION NOTES (avoid false "gaps"). See SCHEMA-CARD-GUIDE.md.
// ════════════════════════════════════════════════════════════════════════════
export const SCHEMA_CARD = `## __YOUR APP__ — Postgres (read-only). Key tables & columns.

### CRITICAL RULES   (the gotchas that make queries wrong if ignored)
- **State any non-obvious storage quirks here.** EXAMPLE: "Money columns are TEXT (e.g. '$1,234.50',
  'USD 12.00'). NEVER cast directly — ALWAYS wrap in safe_to_double(col) for math." Delete if your
  money columns are real numeric.
- **Date format.** EXAMPLE: "Dates are TEXT in 'M/D/YYYY h:mm:ss AM/PM'. Filter a year with
  created_on LIKE '%/2025 %'. Sort chronologically via to_timestamp(created_on,'MM/DD/YYYY HH12:MI:SS AM')."
  If your dates are real timestamptz, say so and drop this.
- Use ILIKE for free-text; '=' for exact ids. Always add a sensible LIMIT.
- **Trigram/ILIKE perf.** If you added pg_trgm GIN indexes (see migrate-snippet.sql), note them:
  "col X has a trigram index → ILIKE '%term%' is fast, but only for 3+ char terms; a bare 2-char
  '%tv%' triggers a seq scan." Tell the agent which columns are safe to fuzzy-match.

### WHICH TABLE?  (so the agent never asks the user where data lives — it reads this map)
- <business concept> → <table> (key columns…)
- Orders / revenue → orders (order_id, customer_id, total, type, channel, created_on)
- Line items / products → order_items (order_id, sku, title, qty, price)
- Customer name/contact → customers (customer_id, name, email, phone)
- Pre-aggregated time series → daily_metrics (day, …)  ← prefer for "over time" questions

### orders   (one row per order)
order_id (text, PK), created_on (text date), customer_id (text), total (TEXT money), type, channel.

### order_items
order_id, sku, title, qty (int), price (TEXT money).  Product category derived from title (CASE/WHEN).

### customers
customer_id (PK), name, email, phone, state.

### DERIVED CONCEPTS  (formulas the agent should reuse, not reinvent)
- EXAMPLE metric: "recovery % = sold_price / retail_price". Define each core KPI once, here.

### DATA-LOCATION NOTES  (prevents false "gaps" — the data usually exists, just elsewhere)
- Spell out cross-table joins that aren't obvious (e.g. "to join inventory to orders, normalize
  UPC via norm_upc() on both sides — raw equality won't match and will time out").
- Call out tables that are SPARSE BY DESIGN (e.g. "only returned orders have a claims row — a low
  claim rate is the return rate, NOT missing data").
- Note attributes that are DERIVED rather than stored (e.g. "screen size isn't a column — extract
  it from the title with a regex"). This stops the agent from reporting them as gaps.
`;

/** Slice for the describe_schema tool (full card; optional table filter is best-effort). */
export function describeSchema(table?: string): string {
  if (!table) return SCHEMA_CARD;
  const re = new RegExp(`^### ${table.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b.*?(?=\\n### |\\n## |$)`, "ims");
  const m = SCHEMA_CARD.match(re);
  return m ? m[0] : SCHEMA_CARD;
}
