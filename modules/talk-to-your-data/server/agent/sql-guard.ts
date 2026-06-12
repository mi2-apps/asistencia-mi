// Read-only SQL guard for agent-generated queries. Defense in depth:
//   1. Syntactic allow: must be a single SELECT/WITH…SELECT statement (no multi-statement).
//   2. Keyword deny: any DDL/DML/admin verb is rejected before execution.
//   3. Identifier deny: secret/internal tables (session, agent_*, pg_*, information_schema).
//   4. Execution inside BEGIN TRANSACTION READ ONLY — Postgres itself rejects any write.
//   5. statement_timeout + enforced LIMIT + row/byte caps on the result.
// Note: even if a clever query slipped past the regexes, the READ ONLY transaction makes
// writes impossible at the engine level. The regexes mainly stop multi-statement injection
// and keep the model away from auth/internal tables.
//
// ── TEMPLATE: generic. Add YOUR sensitive tables to DENY_IDENT below (e.g. a users/billing
//    table you never want the agent to read). `pool` is your app's pg Pool (server/db.ts). ──
import { pool } from "../db.js";

export const AGENT_SQL_TIMEOUT_MS = Number(process.env.AGENT_SQL_TIMEOUT_MS ?? 30000);
export const AGENT_MAX_ROWS = Number(process.env.AGENT_MAX_ROWS ?? 5000);
const MAX_RESULT_BYTES = Number(process.env.AGENT_MAX_RESULT_BYTES ?? 256 * 1024);

// Verbs that must never appear in agent SQL (word-boundary, case-insensitive).
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|MERGE|VACUUM|REINDEX|REFRESH|COMMENT|LOCK|NOTIFY|LISTEN|PREPARE|EXECUTE|SET\s|RESET\s|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|INTO\s)\b/i;
// Internal / secret identifiers the agent may never read. The agent's own bookkeeping tables
// (agent_chats, agent_pages) and auth (session) are blocked by default. __EDIT__: append any
// app-specific sensitive table names (users, billing, api_keys, …) with `|name` here.
const DENY_IDENT = /\b(session|agent_chats|agent_pages|pg_catalog|pg_[a-z_]+|information_schema)\b/i;

export class SqlGuardError extends Error {}

/** Validate + normalize. Throws SqlGuardError on any violation. Returns the safe SQL. */
export function validateSql(raw: string): string {
  let sql = String(raw ?? "").trim();
  if (!sql) throw new SqlGuardError("empty query");
  // Strip leading SQL comments (models like to prefix "-- note\n" or "/* ... */" before the
  // SELECT). Without this they fail the "starts with SELECT/WITH" check and the agent loops.
  let prev: string;
  do {
    prev = sql;
    sql = sql.replace(/^\s*--[^\n]*(\n|$)/, "");   // leading line comment
    sql = sql.replace(/^\s*\/\*[\s\S]*?\*\//, ""); // leading block comment
    sql = sql.trim();
  } while (sql !== prev && sql);
  if (!sql) throw new SqlGuardError("empty query");
  // Strip a single trailing semicolon; any remaining ';' means multi-statement → reject.
  sql = sql.replace(/;\s*$/, "");
  if (sql.includes(";")) throw new SqlGuardError("multiple statements are not allowed");
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new SqlGuardError("only SELECT / WITH queries are allowed");
  if (FORBIDDEN.test(sql)) throw new SqlGuardError("query contains a forbidden keyword (read-only access)");
  if (DENY_IDENT.test(sql)) throw new SqlGuardError("query references a restricted table");
  return sql;
}

function enforceLimit(sql: string, maxRows: number): string {
  // If there's no top-level LIMIT, wrap so we never pull more than maxRows.
  if (/\blimit\s+\d+/i.test(sql)) return sql;
  return `SELECT * FROM (${sql}) AS _agent_q LIMIT ${maxRows}`;
}

export interface AgentSqlResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  sql: string;
}

/** Run agent SQL read-only with timeout + caps. Always rolls back. */
export async function runAgentSql(raw: string, maxRows = AGENT_MAX_ROWS): Promise<AgentSqlResult> {
  const safe = validateSql(raw);
  const wrapped = enforceLimit(safe, maxRows);
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${AGENT_SQL_TIMEOUT_MS}`);
    // GOTCHA: Postgres parallel-query workers each grab a /dev/shm segment. The default
    // container /dev/shm is 64MB and analytic parallel scans exhaust it ("No space left on
    // device"). Either (a) raise the DB container's --shm-size (we use 1g — recommended), or
    // (b) if you can't, force serial here:  SET LOCAL max_parallel_workers_per_gather = 0;
    const res = await client.query(wrapped);
    await client.query("ROLLBACK").catch(() => {});
    let rows = res.rows as Record<string, unknown>[];
    let truncated = rows.length >= maxRows;
    // Byte cap: trim rows until the serialized payload fits, so a wide result can't blow
    // up the model context or the SSE frame.
    while (rows.length > 0 && JSON.stringify(rows).length > MAX_RESULT_BYTES) {
      rows = rows.slice(0, Math.max(1, Math.floor(rows.length * 0.7)));
      truncated = true;
    }
    return { rows, rowCount: rows.length, truncated, sql: safe };
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    if (e instanceof SqlGuardError) throw e;
    const m = String(e?.message ?? e);
    if (/statement timeout/i.test(m)) {
      throw new SqlGuardError(
        `Query timed out (>${Math.round(AGENT_SQL_TIMEOUT_MS / 1000)}s) — it scans too much. ` +
        `Aggregate directly with GROUP BY + LIMIT, add WHERE filters, and do NOT use SELECT DISTINCT ` +
        `over large tables to explore values.`);
    }
    throw new SqlGuardError(`SQL error: ${m}`);
  } finally {
    client.release();
  }
}
