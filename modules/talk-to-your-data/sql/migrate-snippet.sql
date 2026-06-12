-- ════════════════════════════════════════════════════════════════════════════
--  "Talk to your data" — migrate snippet. Run from your server/migrate.ts (idempotent).
-- ════════════════════════════════════════════════════════════════════════════
--
--  ⚠️  HARD RULE — DO NOT BUILD BIG INDEXES INSIDE migrate.ts.  ⚠️
--  migrate.ts runs on every boot under a statement_timeout. A CREATE INDEX on a large table
--  (e.g. a pg_trgm GIN over millions of rows) takes longer than the timeout, the migration
--  throws, the container fails its health check, Coolify restarts it, and migrate runs again
--  → CRASH-LOOP OUTAGE. (We lived this.) Build large/expensive indexes OUT-OF-BAND with
--  CREATE INDEX CONCURRENTLY from a one-off psql session (see the bottom of this file), NEVER
--  here. The two tables below are tiny to create, so they're safe in migrate.

-- ── 1. The two tables the chat module needs ─────────────────────────────────

-- Temporary, agent-generated landing pages. `spec` is a declarative JSON document
-- (title/subtitle + blocks: kpi/chart/table/markdown, each carrying a validated read-only SQL
-- string). Pages render LIVE on view (the saved SQL re-runs). Auto-expire; flushed hourly by
-- server/agent/cleanup.ts; users can extend +30 days.
CREATE TABLE IF NOT EXISTS agent_pages (
  slug           text PRIMARY KEY,
  title          text,
  subtitle       text,
  spec           jsonb        NOT NULL,
  owner          text,
  chat_id        text,                          -- the chat thread that generated this page
  created_at     timestamptz  NOT NULL DEFAULT now(),
  expires_at     timestamptz  NOT NULL,
  extended_count integer      NOT NULL DEFAULT 0,
  view_count     integer      NOT NULL DEFAULT 0
);
-- Safe to re-run if the table predates the chat_id column:
ALTER TABLE agent_pages ADD COLUMN IF NOT EXISTS chat_id text;

-- Chat conversations + audit. messages = full role/content/tool_calls history (for follow-up
-- turns); sql_log = every SQL the agent ran (audit); total_cost_usd accumulates OpenRouter cost.
CREATE TABLE IF NOT EXISTS agent_chats (
  id             text PRIMARY KEY,
  owner          text,
  title          text,
  messages       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  sql_log        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  total_cost_usd double precision NOT NULL DEFAULT 0,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- These two small indexes ARE fine in migrate (tiny tables, fast):
CREATE INDEX IF NOT EXISTS idx_agent_pages_owner ON agent_pages (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_chats_owner ON agent_chats (owner, updated_at DESC);

-- ── 2. OPTIONAL helpers — only if YOUR data needs them ──────────────────────
-- safe_to_double(): parse a TEXT money/qty value ("USD 323.00", "1,234.50", "$0.02", "") to a
-- double, NULL if non-numeric. Include this ONLY if your money columns are TEXT. The overloads
-- let the agent call safe_to_double() uniformly even on already-numeric columns (otherwise it
-- hits "function safe_to_double(double precision) does not exist"). Pure-SQL + IMMUTABLE so it
-- can back functional indexes.
CREATE OR REPLACE FUNCTION safe_to_double(t text) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN cleaned ~ '^-?[0-9]+(\.[0-9]+)?$' THEN cleaned::double precision ELSE NULL END
  FROM (SELECT NULLIF(regexp_replace(coalesce(t,''), '[^0-9.\-]', '', 'g'), '') AS cleaned) s;
$$;
CREATE OR REPLACE FUNCTION safe_to_double(n double precision) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT n; $$;
CREATE OR REPLACE FUNCTION safe_to_double(n numeric) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT n::double precision; $$;
CREATE OR REPLACE FUNCTION safe_to_double(n bigint) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT n::double precision; $$;
CREATE OR REPLACE FUNCTION safe_to_double(n integer) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT n::double precision; $$;

-- pg_trgm enables fast ILIKE '%term%' on big text columns. Guarded: if the role can't create
-- the extension, migration CONTINUES (and the trigram indexes are simply skipped) instead of
-- crashing. Ask your DB admin to enable it, then build the GIN index CONCURRENTLY (below).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[migrate] pg_trgm not available (needs superuser) — trigram indexes skipped: %', SQLERRM;
END $$;

-- ── 3. BIG INDEXES → build these MANUALLY, NOT in migrate.ts ─────────────────
-- Run from a one-off psql session (CONCURRENTLY can't run inside migrate's transaction, and it
-- won't block reads/writes). Example for fast TV/title ILIKE on a big line-items table:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_title_trgm
--     ON order_items USING gin (title gin_trgm_ops);
--
-- And a functional index to back safe_to_double() sorts if you sort/aggregate by a TEXT money col:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_total_num
--     ON orders ((safe_to_double(total)));
