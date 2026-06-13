# Developer Manual — stack module

A versioned, role-scoped knowledge base of your app's **entire data model** — every table, column, relationship, status enum, and business rule, in plain language — so **AI agents and chatbots answer from ground truth instead of guessing**, and humans get a living data dictionary.

Extracted (genericized) from the MI AI Manifest implementation. Same "copy-from module" shape as `modules/talk-to-your-data`.

## What you get
- **Two consumption layers:** human-readable Markdown pages **and** a structured, agent-queryable **data dictionary** (one row per column: meaning, type, nullability, allowed values, relationships) + per-table purpose/FKs/sample-queries.
- **Admin/supervisor UI** at `/developer-manual` (Markdown + GFM tables, search, inline editing).
- **Secure editing API** — session (admin/supervisor) and API-key (agents) — with **per-page revision history** and **optimistic-concurrency** conflict protection (`If-Match` → `409`).
- **MCP server** (Streamable HTTP) exposing 6 read tools so any MCP client (Claude, Claude Code, your agents) can read/search the model.
- A **maintenance mandate** for CLAUDE.md so the manual never goes stale.

## Files
```
sql/migrate-snippet.sql                  -- the 4 tables + tsvector search (any Postgres app)
server/schema-snippet.ts                 -- Drizzle table defs (Drizzle apps) [EDIT imports]
server/devManualStorage.ts               -- data layer (pages CRUD, concurrency, revisions, dictionary) [EDIT imports]
server/routes/developerManual.ts         -- session API (admin/supervisor) [EDIT session shape]
server/routes.external-snippet.ts        -- agent/Bearer + MCP routes (paste into your external API router) [EDIT]
server/mcp/devManualMcp.ts               -- MCP server [EDIT app name]
server/register-snippet.ts               -- how to mount the session router
client/DeveloperManualViewer.tsx         -- admin/supervisor viewer [EDIT ui import paths + app name]
client/App-routes-snippet.tsx            -- route wiring
scripts/seed-dev-manual.cjs              -- generic, directory-driven seeder [EDIT db conn]
docs/developer-manual/seed/              -- placeholder content (replace with yours)
SEED-YOUR-DATA-DICTIONARY.md             -- how to write/generate your manual content
CLAUDE-snippet.md                        -- paste into your CLAUDE.md (maintenance mandate)
```

## Install (≈30–45 min + your content)
1. **DB:** apply `sql/migrate-snippet.sql` (or paste `server/schema-snippet.ts` into your Drizzle `shared/schema.ts` and migrate). It's idempotent.
2. **Server:** copy `server/devManualStorage.ts`, `server/routes/developerManual.ts`, `server/mcp/devManualMcp.ts`. Mount the session router (`server/register-snippet.ts`). Paste `routes.external-snippet.ts` into your **key-authed external API router**.
3. **Deps:** `npm i @modelcontextprotocol/sdk` (server, for MCP) and `npm i react-markdown remark-gfm` (client).
4. **Client:** copy `DeveloperManualViewer.tsx` into your components and add the routes (`App-routes-snippet.tsx`).
5. **Content:** put your Markdown pages in `docs/developer-manual/seed/*.md` and per-domain JSON in `docs/developer-manual/seed/dictionary/*.json`, then run `node scripts/seed-dev-manual.cjs <yourDb>`. See SEED-YOUR-DATA-DICTIONARY.md.
6. **CLAUDE.md:** paste `CLAUDE-snippet.md`.
7. **Issue an agent key** with permission `{"developer_manual":["read"]}` (read) or `["read","write"]`.

## `[EDIT]` map (the only per-app touches)
- **`server/schema-snippet.ts`** — `users`/`apiKeys` references must point at YOUR tables.
- **`server/devManualStorage.ts`** — import paths (`@shared/schema`, `./db`).
- **`server/routes/developerManual.ts`** — the `requireAuth`/`requireManualAccess` guards assume `req.session.user.role` ∈ {admin, supervisor}. Adjust to your session/RBAC.
- **`server/routes.external-snippet.ts`** — assumes a key middleware with `requireApiKey` + `requirePermission(resource, action)` and `req.apiKey.id`. Adapt to yours. If you have no API-key system, gate these with whatever auth you use (or drop the agent path and keep session+UI).
- **`server/mcp/devManualMcp.ts`** — `__APP_NAME__` server name.
- **`client/DeveloperManualViewer.tsx`** — `@/components/ui/*`, `@/lib/queryClient`, `@/hooks/use-toast` import paths; `__APP_NAME__`; and it expects `/api/auth/me` to return `{ user: {...} }` (uses `select: d => d.user ?? d`).
- **`scripts/seed-dev-manual.cjs`** — DB connection + default db name (`CHANGEME_dev`).

## Gotchas (learned in production)
- **`/api/auth/me` envelope:** the viewer unwraps `{ user }`. If yours is flat, the `select` already falls back (`d.user ?? d`).
- **Markdown tables need `remark-gfm`** — without it, tables render as raw pipes.
- **Dictionary is generated, pages are edited.** The seeder **full-refreshes** the dictionary every run (TRUNCATE+insert) and is idempotent for pages (never overwrites edits). Keep dictionary source in `seed/dictionary/*.json`.
- **Nullability is authoritative from the DB:** the seeder overrides each column's `is_nullable` from `information_schema` when the column exists live — so docs can't drift on nullability.
- **MCP is stateful** (Mcp-Session-Id) with `enableJsonResponse` — works with curl and standard MCP clients; GET/DELETE manage the session.
