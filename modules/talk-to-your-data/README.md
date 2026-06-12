# Talk to your data — reusable agentic data-chat module (MI stack)

A drop-in conversational-analytics module for any **Vite + React + Express + Postgres** MI-stack
app. Users ask questions in plain English; an OpenRouter agent writes **read-only** SQL, answers
grounded in real data, renders charts/KPIs inline, builds shareable temporary dashboards, and lets
you refine them in place — all behind your existing SSO.

Extracted from `trgdata-app` (live at trgdata.mi2.com.mx → "Data Chat"). This is the genericized
scaffold: trgdata-specific schema/queries are stripped to placeholders; everything else is the
battle-tested original.

> See **`/stack` §14c** for where this fits in the platform, and **§14** for the OpenRouter
> per-app key + monthly cost cap policy.

---

## What you get

- **Talk to the data** — NL questions → answers backed by live SQL (no hallucinated numbers; the
  agent must `run_sql` before answering).
- **Inline visuals** — KPI cards, bar/line/composed/pie charts, tables, markdown — from a **safe
  declarative block spec** (the model emits JSON specs, never code/HTML → no eval/XSS).
- **Temporary dashboards / "files"** — the agent assembles blocks into a shareable page at
  `/p/:slug`. **Live on view** (re-runs the saved SQL each visit), **auto-expire (7 or 30 days)**
  with an hourly cleanup sweep, and **extend +30 days** on demand.
- **Refine in place** — on any produced dashboard, say "only last 30 days" / "only Texas" and it
  re-runs *that* dashboard's data with the filter, without rebuilding.
- **Dashboard ↔ chat round-trip** — every page links back to the chat thread that built it.
- **Drive existing pages** — `set_filters` navigates your app to a filtered view.
- **Per-user memory across devices** — threads persist server-side (owner-scoped); the latest
  reopens on load; thread switcher + "New chat"; survives reloads and device switches.
- **Resilient streaming** — SSE; if a mobile connection drops mid-turn the server still finishes
  and persists, and the client recovers the answer by polling the saved thread.
- **Multilingual** — auto-detects EN / es-MX / zh-CN from the user's message and replies in kind
  (matches the app's i18n locale); UI chrome localized via translation keys.
- **Mobile-optimized** — the chat view scrolls naturally on phones (no clipped composer).
- **Cost-efficient + safe** — cheap-first OpenRouter model + fallback chain, always concludes with
  a forced no-tools synthesis, per-turn cost + full SQL audit (`/chat/logs`). Typical turn a few
  tenths of a cent.

---

## File map (~8 server + 4 client files + 1 migrate snippet)

```
server/agent/
  openrouter.ts     OpenAI SDK → OpenRouter baseURL, cheap-first + fallbacks   [EDIT: 2 headers]
  sql-guard.ts      read-only SELECT/WITH guard, READ ONLY txn, caps           [EDIT: deny-list]
  blocks.ts         declarative kpi/chart/table/markdown + SQL resolver        (generic)
  pages-store.ts    agent_pages persistence (parameterized writes)             (generic)
  cleanup.ts        hourly expiry sweep                                        (generic)
  schema-card.ts    ⭐ YOUR data dictionary + live introspection               [EDIT: the big one]
  loop.ts           tool-calling loop + system prompt + robustness machinery   [EDIT: prompt+filters]
server/
  routes.chat-snippet.ts   paste the chat/pages routes into your routes.ts     [MERGE]
client/
  pages/chat.tsx              SSE consumer, thread memory, recover-on-drop      (generic)
  pages/temp-page.tsx         /p/:slug — live page, extend, refine, open-chat   (generic)
  components/page-renderer.tsx  safe block renderer (reuses your KpiCard/charts) [EDIT: imports]
  lib/page-spec.ts            client mirror of the block types                  (generic)
sql/
  migrate-snippet.sql   agent_pages + agent_chats DDL (+ optional helpers)      [MERGE into migrate.ts]
i18n/
  translation-keys.en.json   chat/temp UI keys to merge into your locale files  [MERGE + translate]
```

`[EDIT]` = customize per app. The bulk of the work is **`schema-card.ts`** — see
**`SCHEMA-CARD-GUIDE.md`**.

---

## Install (≈ an afternoon)

1. **Copy files** into the matching paths in your app (`server/agent/*`, `server/`, `client/*`).
2. **Dependencies:** `npm i openai` (server) — `recharts`, `lucide-react`, `wouter`,
   `react-i18next` are already in the MI stack template.
3. **DB:** paste `sql/migrate-snippet.sql` into your `server/migrate.ts` run. ⚠️ Read the
   **HARD RULE** at the top — never build big indexes in migrate (crash-loop risk); build those
   `CONCURRENTLY` out-of-band.
4. **Routes:** merge `server/routes.chat-snippet.ts` into your auth-gated `api` router. In your
   server entrypoint call `scheduleAgentCleanup()` once after the DB pool is ready.
5. **Client routes** (wouter):
   ```tsx
   const Chat = lz(() => import("@client/pages/chat"), "Chat");
   const TempPage = lz(() => import("@client/pages/temp-page"), "TempPage");
   // …
   <Route path="/chat" component={Chat} />
   <Route path="/p/:slug" component={TempPage} />
   ```
   Add a nav item to `/chat`.
6. **i18n:** merge `i18n/translation-keys.en.json` into `client/public/locales/en/translation.json`,
   then translate copies into `es-MX` and `zh-CN`. (The agent already replies in the user's language
   at runtime; these keys localize the static buttons/placeholders.)
7. **Env (Coolify):** set `OPENROUTER_API_KEY` (per-app key with a monthly cap — see /stack §14).
   Optional: `AGENT_MODEL_PRIMARY`, `AGENT_MODEL_FALLBACKS`, `AGENT_MAX_ITERATIONS`,
   `AGENT_SQL_TIMEOUT_MS`. Without the key the feature self-disables and the UI shows a notice.
8. **⭐ Write your schema card** (`server/agent/schema-card.ts`) — follow `SCHEMA-CARD-GUIDE.md`.
   This is the difference between a useful bot and a confidently-wrong one.
9. **Edit `loop.ts`:** the system-prompt first paragraph (who the agent is), `FILTER_PAGES` (your
   real dashboard routes), and the `set_filters` filter property list (your real URL filters).

---

## Security model (important — the agent can read your whole DB)

- **Always behind SSO + allowlist.** Never expose these routes publicly.
- **Read-only SQL guard** (`sql-guard.ts`): SELECT/WITH only, single-statement, DDL/DML blocked,
  restricted-table deny-list (auth + the module's own bookkeeping tables — **add your sensitive
  tables**), executed in `BEGIN TRANSACTION READ ONLY` with `statement_timeout` + enforced LIMIT +
  row/byte caps. Even a query that slipped the regexes can't write — the engine forbids it.
- **No code execution.** The model emits declarative block JSON, never markup/JS. The renderer
  chooses among fixed chart/table/kpi primitives.
- **Page writes are parameterized.** The agent never writes SQL into `agent_pages`.
- **Key is server-side only**, never sent to the client; per-app monthly cap (/stack §14).

---

## Gotchas baked in (we hit all of these — they're already handled in the code)

- **Never build big indexes in migrate.** A pg_trgm GIN build blew the statement_timeout →
  migration threw → health check failed → restart loop → **outage**. Build `CONCURRENTLY`
  out-of-band. (See `sql/migrate-snippet.sql`.)
- **TEXT money.** Wrap in `safe_to_double()` (+ overloads so it's safe on already-numeric columns).
- **Fuzzy text search.** `pg_trgm` GIN for fast `ILIKE '%term%'`, but only for 3+ char terms — tell
  the agent (in the schema card) which columns are indexed and the min length.
- **Provider quirks.** Gemini returns `MALFORMED_FUNCTION_CALL` on tool turns and *ignores*
  `tool_choice:"none"` → DeepSeek is primary, and the final answer is forced by calling the model
  with **no tools** (`synthesize()`), which works on every provider. This is the "gets stuck / no
  answer" fix.
- **SSE + mobile.** Swallow write errors, always persist server-side, recover on reload (the client
  polls the saved thread). This is the "Load failed" fix.
- **Postgres `/dev/shm`.** Parallel analytic queries exhaust the default 64MB container shm
  ("No space left on device"). Raise the DB container `--shm-size` (we use `1g`) — or force serial
  in `sql-guard.ts` (commented one-liner there).

---

## How it works (one paragraph)

The SSE route (`POST /api/v1/chat`) streams events while `loop.ts` runs a tool-calling loop against
OpenRouter. The agent's tools are `run_sql` / `list_tables` / `describe_schema` (read), `render_block`
(inline visual), `create_page` (shareable page), `set_filters` (navigate). Visual data is resolved
**server-side** — the model emits a block spec, the server runs its guarded SQL and attaches rows, so
result sets never bloat the model context. Pages store specs without data and re-resolve live on view.
Threads + an audit log persist to `agent_chats`; pages to `agent_pages`. The loop always concludes
with a written answer (forced no-tools synthesis if it runs out of turns), and the client recovers the
persisted answer if the stream drops.
