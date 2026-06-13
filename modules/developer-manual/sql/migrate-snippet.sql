-- Migration 0141: Developer Manual framework
-- A dedicated, versioned knowledge base of the system's data model, read by human
-- engineers (admin/supervisor) and AI agents (via API keys), editable through a
-- secure API with per-page revision history + optimistic-concurrency conflict
-- detection. Content is Markdown. See docs/developer-manual + /developer-manual.

CREATE TABLE IF NOT EXISTS dev_manual_pages (
  id                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     varchar(150) NOT NULL UNIQUE,
  title                    text NOT NULL,
  section                  varchar(60) NOT NULL DEFAULT 'Domains',
  summary                  text,
  content_md               text NOT NULL,
  display_order            integer NOT NULL DEFAULT 0,
  is_published             boolean NOT NULL DEFAULT true,
  version                  integer NOT NULL DEFAULT 1,
  edit_lock_version        integer NOT NULL DEFAULT 1,
  created_by               varchar REFERENCES users(id) ON DELETE SET NULL,
  created_by_api_key_id    varchar REFERENCES api_keys(id) ON DELETE SET NULL,
  last_edited_by           varchar REFERENCES users(id) ON DELETE SET NULL,
  last_edited_by_api_key_id varchar REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_manual_pages_section_order ON dev_manual_pages (section, display_order);
CREATE INDEX IF NOT EXISTS idx_dev_manual_pages_published ON dev_manual_pages (is_published);

-- Full-text search over title + body (no trigger needed; generated + GIN index).
ALTER TABLE dev_manual_pages
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content_md, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_dev_manual_pages_search ON dev_manual_pages USING GIN (search_tsv);

CREATE TABLE IF NOT EXISTS dev_manual_revisions (
  id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id              varchar NOT NULL REFERENCES dev_manual_pages(id) ON DELETE CASCADE,
  version              integer NOT NULL,
  title                text NOT NULL,
  content_md           text NOT NULL,
  change_summary       text,
  edited_by            varchar REFERENCES users(id) ON DELETE SET NULL,
  edited_by_api_key_id varchar REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_dev_manual_revisions_page_version UNIQUE (page_id, version)
);

CREATE INDEX IF NOT EXISTS idx_dev_manual_revisions_page ON dev_manual_revisions (page_id);
-- Migration 0142: Developer Manual — structured, agent-queryable data dictionary
-- Generated reference data (full-refreshed by scripts/seed-dev-manual.cjs) that lets
-- AI agents look up a column's exact meaning, type, nullability, allowed values, and
-- relationships without parsing the Markdown pages. Distinct from the editable pages.

CREATE TABLE IF NOT EXISTS dev_manual_table_info (
  table_name     varchar(120) PRIMARY KEY,
  domain_key     varchar(60),
  purpose        text,
  foreign_keys   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_count   integer NOT NULL DEFAULT 0,
  updated_at     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev_manual_dictionary (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      varchar(120) NOT NULL,
  column_name     varchar(120) NOT NULL,
  data_type       varchar(120),
  is_nullable     boolean,
  meaning         text,
  relationships   text,
  allowed_values  text,
  notes           text,
  domain_key      varchar(60),
  CONSTRAINT uq_dev_manual_dictionary_table_col UNIQUE (table_name, column_name)
);

ALTER TABLE dev_manual_dictionary ADD COLUMN IF NOT EXISTS ordinal integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dev_manual_dictionary_table ON dev_manual_dictionary (table_name);

-- Fuzzy search across table + column + meaning + relationships (for agent questions).
ALTER TABLE dev_manual_dictionary
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(table_name, '') || ' ' || coalesce(column_name, '') || ' ' ||
      coalesce(meaning, '') || ' ' || coalesce(relationships, '') || ' ' || coalesce(allowed_values, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_dev_manual_dictionary_search ON dev_manual_dictionary USING GIN (search_tsv);
