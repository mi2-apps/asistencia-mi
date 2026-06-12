// Agentic tool-calling loop. Talks to OpenRouter (cheap-first model + fallbacks), exposes
// read-only data tools, and streams events to the caller (the SSE route) as it works.
// Non-streaming completions feed tool results back in a loop; the assistant's prose answer
// and tool/visual events are surfaced to the client. Data for visuals is resolved
// server-side (render_block/create_page run their SQL here) so result rows never bloat the
// model context — token-efficient by construction.
//
// ── TEMPLATE: the ONLY app-specific things here are (1) FILTER_PAGES, (2) the set_filters
//    filter property list, and (3) SYSTEM_PROMPT. Everything else (the robustness machinery)
//    is generic and battle-tested — keep it. ──
import { client, MODELS, AGENT_MAX_ITERATIONS } from "./openrouter.js";
import { runAgentSql } from "./sql-guard.js";
import { SCHEMA_CARD, describeTable, listTables } from "./schema-card.js";
import { validateBlock, resolveBlock, type Block } from "./blocks.js";
import { createPage } from "./pages-store.js";

export type AgentEvent =
  | { type: "token"; text: string }
  | { type: "tool"; name: string; status: "start" | "done"; detail?: string }
  | { type: "block"; block: any }
  | { type: "page"; slug: string; url: string; title: string; expiresAt: string }
  | { type: "action"; action: "set_filters"; page: string; filters: Record<string, string> }
  | { type: "done"; cost: number }
  | { type: "error"; message: string };

// __EDIT__: the existing dashboard routes the agent may navigate to via set_filters.
// Set to [] to disable navigation entirely (then remove the set_filters tool below).
const FILTER_PAGES = ["/orders", "/customers", "/trends"];

const BLOCK_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["kpi", "kpis", "chart", "table", "markdown"] },
    title: { type: "string" },
    sql: { type: "string", description: "read-only SELECT feeding this block (omit for markdown)" },
    valueKey: { type: "string", description: "kpi: column in row 0 to display" },
    format: { type: "string", enum: ["int", "usd", "pct", "text"] },
    glow: { type: "string", enum: ["blue", "green", "purple", "amber", "red"] },
    subtitle: { type: "string" },
    cards: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, valueKey: { type: "string" }, format: { type: "string" }, glow: { type: "string" } } },
    },
    chartType: { type: "string", enum: ["bar", "line", "composed", "pie"] },
    xKey: { type: "string" },
    series: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, color: { type: "string" } } } },
    height: { type: "number" },
    columns: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, format: { type: "string" }, align: { type: "string" } } } },
    md: { type: "string" },
  },
  required: ["kind"],
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "run_sql",
      description: "Run a read-only SELECT against the database and get the rows back so you can reason about / answer with the data. Always use a reasonable LIMIT.",
      parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "List all queryable tables in the database. Use this instead of asking the user what exists.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "describe_schema",
      description: "Get authoritative column names + types for a table (live from the database). Pass a table name. Omit to get the schema overview + table list. Use this — never ask the user about columns.",
      parameters: { type: "object", properties: { table: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "render_block",
      description: "Render ONE visual inline in the chat (kpi/kpis/chart/table/markdown). The server runs the block's SQL and renders it — you do NOT need the rows. Use after you've confirmed the SQL works with run_sql.",
      parameters: BLOCK_SCHEMA,
    },
  },
  {
    type: "function",
    function: {
      name: "create_page",
      description: "Create a temporary shareable landing page from several blocks and give the user its link. Pages render LIVE (SQL re-runs on view) and expire (default 30 days, or 7).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          expiresDays: { type: "number", enum: [7, 30] },
          blocks: { type: "array", items: BLOCK_SCHEMA },
        },
        required: ["title", "blocks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_filters",
      description: "Navigate the user's dashboard to an existing page with filters applied (drives the on-screen data). filters are URL query params.",
      // NOTE: use EXPLICIT string properties (NOT additionalProperties) — Gemini's
      // function-calling schema rejects additionalProperties, which makes the whole request
      // fail with finish_reason=error. __EDIT__ the property list to YOUR app's real filters.
      parameters: {
        type: "object",
        properties: {
          page: { type: "string", enum: FILTER_PAGES },
          filters: {
            type: "object",
            description: "URL query filters to apply; include only the ones relevant to the page.",
            properties: {
              type: { type: "string" },
              state: { type: "string", description: "2-letter US state, e.g. CA" },
              period: { type: "string", description: "e.g. 2025, 2024, 30d, 90d" },
              category: { type: "string" },
              search: { type: "string" },
              q: { type: "string" },
              sort: { type: "string" },
            },
          },
        },
        required: ["page", "filters"],
      },
    },
  },
];

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────────────────
// __EDIT__: the first paragraph (who the agent is) + any app-specific data rules. The generic
// rules below (read-only, efficiency, multilingual, gap-analysis, always-conclude) are good
// defaults — keep them. The SCHEMA_CARD is appended automatically.
const SYSTEM_PROMPT = `You are the data analyst agent inside the __YOUR APP__ dashboard.
You help the user "talk to the data": answer questions, build charts/KPIs, drive on-screen
filters, and create temporary landing pages.

TOOLS
- run_sql: see data to reason/answer. - describe_schema: look up tables/columns.
- render_block: show a visual inline (server runs the SQL; you don't need the rows back).
- create_page: assemble blocks into a shareable, expiring page and give the user the link.
- set_filters: jump the user to an existing dashboard page with filters applied.

RULES
- You ALREADY KNOW the database (full schema below + the WHICH TABLE map). NEVER ask the user
  where data lives, which table/column to use, or how things are structured. If you need exact
  column names, call list_tables / describe_schema — do not ask the user.
- Read-only. Only SELECT/WITH. (If your money columns are TEXT, ALWAYS wrap them in
  safe_to_double(col) for math — never cast TEXT money like "$0.02" directly.)
- For ANY question about the data, you MUST call run_sql to get real numbers BEFORE answering —
  never answer a data question from memory or from the schema alone. describe_schema is only for
  finding column names; it is not data.
- EFFICIENCY (tables may have millions of rows): aggregate DIRECTLY with GROUP BY + LIMIT in ONE
  query. Do NOT run "SELECT DISTINCT col …" to explore values — that full-scans the table and
  times out. Filter and aggregate in the same query. If a query times out, make it simpler/
  narrower — don't retry slight variants.
- Verify a query with run_sql before render_block/create_page. Be concise: when you render visuals
  or make a page, briefly tell the user what you did and the link.
- If a request is ambiguous, ask ONE short clarifying question.
- MULTILINGUAL: detect the language of the user's message and ALWAYS reply in that SAME language —
  English, Spanish (es-MX), and Mandarin Chinese (zh-CN) are the supported UI locales. Write ALL
  prose, chart/KPI/page titles, and clarifying questions in the user's language. Keep SQL,
  table/column identifiers, numbers, and currency as-is. If the message language is unclear, use
  the UI locale provided below.
- OPEN-ENDED / "find gaps in the data" / exploratory questions: be SYSTEMATIC and DECISIVE, not
  scattershot. First call describe_schema / list_tables to confirm real column names (NEVER guess).
  Then run a SMALL set of targeted aggregate queries (coverage by period, NULL/empty counts per key
  column, row counts, distinct counts) — do NOT fire many similar variants. Then SYNTHESIZE: list
  the concrete findings and what'd be needed to fill any gaps. You have limited tool turns —
  converge quickly and ALWAYS end with a written summary, even if partial; never stop without an answer.

${SCHEMA_CARD}`;

export interface AgentResult {
  messages: any[];
  cost: number;
  sqlLog: { sql: string; rowCount?: number; error?: string }[];
}

// Per-call timeout so a stalled connection to OpenRouter (egress hiccup, slow model)
// surfaces as a quick error instead of an endless "thinking" spinner.
const MODEL_TIMEOUT_MS = Number(process.env.AGENT_MODEL_TIMEOUT_MS ?? 45000);

// Try each model in turn (explicit fallback — one `model` per request, never model+models
// together which some providers reject). Returns the first success; throws the last error.
async function callModel(messages: any[]): Promise<any> {
  let lastErr: any;
  for (const model of MODELS) {
    try {
      const resp: any = await client!.chat.completions.create(
        {
          model,
          messages,
          tools: TOOLS as any,
          tool_choice: "auto",
          temperature: 0.2,
          max_tokens: 1500,
          usage: { include: true }, // OpenRouter: return cost in usage
        } as any,
        { timeout: MODEL_TIMEOUT_MS, maxRetries: 1 },
      );
      // OpenRouter can return HTTP 200 with a provider-side failure: a top-level `error`
      // or a choice whose finish_reason is "error" (0 content/0 tools). Treat that as a
      // failure so we fall back to the next model instead of silently returning nothing.
      const choice = resp?.choices?.[0];
      const fr = choice?.finish_reason;
      if (resp?.error || fr === "error" || !choice) {
        const detail = JSON.stringify(resp?.error ?? choice ?? resp ?? {}).slice(0, 600);
        console.error(`[chat] model ${model} provider error finish=${fr}: ${detail}`);
        throw new Error(resp?.error?.message ?? `provider returned finish=${fr}`);
      }
      return resp;
    } catch (e: any) {
      lastErr = e;
      console.error(`[chat] model ${model} failed: ${e?.status ?? ""} ${e?.message ?? e}`);
    }
  }
  throw lastErr ?? new Error("no model available");
}

// Force a final written answer with NO tools provided (the model literally cannot call a tool
// that isn't in the request, so it MUST return text). Reliable across providers — unlike
// tool_choice:"none", which DeepSeek ignores. Used when the tool loop runs out of turns.
async function synthesize(messages: any[]): Promise<{ text: string; cost: number }> {
  for (const model of MODELS) {
    try {
      const resp: any = await client!.chat.completions.create(
        {
          model,
          messages: [
            ...messages,
            { role: "user", content: "Stop using tools. Using ONLY the query results already gathered above, write the final answer now — a clear, concise summary. If some data was missing or a query failed, state what is known and call out the gaps explicitly." },
          ],
          temperature: 0.2,
          max_tokens: 2200,
          usage: { include: true },
        } as any,
        { timeout: MODEL_TIMEOUT_MS, maxRetries: 1 },
      );
      const text = resp?.choices?.[0]?.message?.content ?? "";
      if (text) return { text, cost: Number(resp?.usage?.cost ?? 0) };
    } catch (e: any) {
      console.error(`[chat] synthesize ${model} failed: ${e?.message ?? e}`);
    }
  }
  return { text: "", cost: 0 };
}

export async function runAgent(opts: {
  message: string;
  history?: any[];
  owner?: string;
  chatId?: string;
  lang?: string;
  emit: (e: AgentEvent) => void;
}): Promise<AgentResult> {
  if (!client) throw new Error("OpenRouter not configured");
  const { message, owner } = opts;
  const LANG_NAME: Record<string, string> = { en: "English", "es-MX": "Spanish (es-MX)", "zh-CN": "Mandarin Chinese (zh-CN)" };
  const uiLang = LANG_NAME[opts.lang ?? ""] ?? "English";
  // Track whether the turn produced any user-visible output or surfaced an error, so we
  // never end on silence (the original "stuck/no answer" symptom).
  let produced = false;
  let errored = false;
  const emit = (e: AgentEvent) => {
    if ((e.type === "token" && e.text) || e.type === "block" || e.type === "page" || e.type === "action") produced = true;
    if (e.type === "error") errored = true;
    opts.emit(e);
  };
  const messages: any[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nUI locale (default reply language if the user's message language is unclear): ${uiLang}.` },
    ...(opts.history ?? []).filter((m) => m.role !== "system"),
    { role: "user", content: message },
  ];
  const sqlLog: AgentResult["sqlLog"] = [];
  let cost = 0;
  let concluded = false; // true once the model gives a final answer with no tool calls

  for (let iter = 0; iter < AGENT_MAX_ITERATIONS; iter++) {
    let resp: any;
    try {
      resp = await callModel(messages);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error("[chat] all models failed:", e?.status ?? "", msg);
      emit({ type: "error", message: `Model request failed: ${msg}` });
      break;
    }
    cost += Number(resp?.usage?.cost ?? 0);
    const msg = resp?.choices?.[0]?.message;
    if (!msg) { emit({ type: "error", message: "empty model response" }); break; }
    messages.push(msg);

    const toolCalls = msg.tool_calls ?? [];
    console.log(`[chat] iter ${iter} model=${resp?.model ?? "?"} finish=${resp?.choices?.[0]?.finish_reason ?? "?"} tools=${toolCalls.length} content=${msg.content ? msg.content.length + "ch" : "0"} cost=$${cost.toFixed(5)}`);
    if (msg.content) emit({ type: "token", text: msg.content });

    if (!toolCalls.length) { concluded = true; break; } // natural final answer

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* ignore */ }
      emit({ type: "tool", name, status: "start", detail: name === "run_sql" ? String(args.sql ?? "").slice(0, 200) : undefined });
      console.log(`[chat] tool=${name} args=${(name === "run_sql" ? String(args.sql ?? "") : JSON.stringify(args)).replace(/\s+/g, " ").slice(0, 240)}`);
      let toolResult: any;
      try {
        if (name === "run_sql") {
          const r = await runAgentSql(String(args.sql ?? ""));
          sqlLog.push({ sql: r.sql, rowCount: r.rowCount });
          toolResult = { rowCount: r.rowCount, truncated: r.truncated, rows: r.rows };
          emit({ type: "tool", name, status: "done", detail: `${r.rowCount} rows${r.truncated ? " (capped)" : ""}` });
        } else if (name === "list_tables") {
          toolResult = { tables: await listTables() };
          emit({ type: "tool", name, status: "done" });
        } else if (name === "describe_schema") {
          toolResult = args.table
            ? { schema: await describeTable(String(args.table)) }
            : { schema: SCHEMA_CARD, tables: await listTables() };
          emit({ type: "tool", name, status: "done" });
        } else if (name === "render_block") {
          const block = validateBlock(args);
          const resolved = await resolveBlock(block);
          if (block.sql) sqlLog.push({ sql: block.sql, rowCount: resolved.rowCount, error: resolved.error });
          emit({ type: "block", block: resolved });
          toolResult = { ok: !resolved.error, rowCount: resolved.rowCount, error: resolved.error };
          emit({ type: "tool", name, status: "done", detail: resolved.error ? `error: ${resolved.error}` : `${resolved.rowCount} rows` });
        } else if (name === "create_page") {
          const blocks = (args.blocks ?? []).map((b: any) => validateBlock(b)) as Block[];
          // Resolve to check SQL; keep the blocks that work, drop the ones that error — a page
          // builds as long as at least one block resolves (don't fail the whole page on one bad query).
          const resolved = await Promise.all(blocks.map((b) => resolveBlock(b)));
          const good = blocks.filter((_, i) => !resolved[i].error);
          if (!good.length) throw new Error(`all block queries failed: ${resolved.find((r) => r.error)?.error ?? "no data"}`);
          const page = await createPage({ title: args.title, subtitle: args.subtitle, blocks: good, owner, chatId: opts.chatId, expiresDays: args.expiresDays });
          emit({ type: "page", slug: page.slug, url: page.url, title: args.title, expiresAt: page.expiresAt });
          toolResult = { ok: true, url: page.url, slug: page.slug, expiresAt: page.expiresAt };
          emit({ type: "tool", name, status: "done", detail: page.url });
        } else if (name === "set_filters") {
          const page = String(args.page ?? "");
          if (!FILTER_PAGES.includes(page)) throw new Error(`unknown page: ${page}`);
          const filters: Record<string, string> = {};
          for (const [k, v] of Object.entries(args.filters ?? {})) filters[k] = String(v);
          emit({ type: "action", action: "set_filters", page, filters });
          toolResult = { ok: true };
          emit({ type: "tool", name, status: "done", detail: page });
        } else {
          toolResult = { error: `unknown tool ${name}` };
          emit({ type: "tool", name, status: "done", detail: "unknown tool" });
        }
      } catch (e: any) {
        toolResult = { error: String(e?.message ?? e) };
        console.error(`[chat] tool=${name} ERROR: ${String(e?.message ?? e).slice(0, 200)}`);
        emit({ type: "tool", name, status: "done", detail: `error: ${String(e?.message ?? e).slice(0, 120)}` });
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult).slice(0, 60_000) });
    }
  }

  // Ran out of tool turns without a natural answer → force a no-tools synthesis so the user
  // ALWAYS gets a written result (this is the "gets stuck / no answer" fix).
  if (!concluded) {
    const syn = await synthesize(messages);
    cost += syn.cost;
    if (syn.text) {
      emit({ type: "token", text: syn.text });
      messages.push({ role: "assistant", content: syn.text }); // persist so it's recoverable on reload
    }
    console.log(`[chat] forced synthesis -> ${syn.text ? syn.text.length + "ch" : "EMPTY"}`);
  }
  if (!produced && !errored) emit({ type: "error", message: "The model returned an empty response. Please rephrase and try again." });
  emit({ type: "done", cost });
  console.log(`[chat] turn done concluded=${concluded} produced=${produced} errored=${errored} sql=${sqlLog.length} cost=$${cost.toFixed(5)}`);
  // Drop the system prompt from the persisted history (re-added each turn).
  return { messages: messages.filter((m) => m.role !== "system"), cost, sqlLog };
}
