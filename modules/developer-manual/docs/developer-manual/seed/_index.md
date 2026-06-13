# {{APP_NAME}} — Developer Manual

> Authoritative data-model reference for {{APP_NAME}}. Replace this placeholder content with your app's real pages (see SEED-YOUR-DATA-DICTIONARY.md).

---

## ⚠️ Maintenance mandate — read first

**This manual is only useful if it stays current. Keeping it accurate is part of every workflow that touches the data model — for human developers and AI agents alike.**

Any change that adds, renames, or removes a **table or column**, alters a **relationship/foreign key**, introduces a new **status value** or **subsystem**, or otherwise changes the **architecture** is **not complete until the developer manual is updated in the same change.** Whenever you ship such a change:

1. Update the affected domain page(s) (UI editor, or `PUT /api/v1/developer-manual/pages/:id`, or agents via `/api/v1/external/developer-manual/*`).
2. Refresh the structured dictionary: re-run `node scripts/seed-dev-manual.cjs <db>`.
3. Add a new page for a brand-new domain.

Treat documentation drift as a bug: stale definitions cause every downstream chatbot, agent, and integrator to answer **wrong**.

---

## How to read this manual (for AI agents)

This is a **data dictionary**, not prose. Treat it as **ground truth** — answer from the documented meaning/units/relationships; never guess. Query it via the REST API, the MCP tools (`get_table`, `find_field`, `search`, `read_page`, `list_tables`, `overview`), or browse here.

## Domain sections

Replace the example page with one page per domain of your schema. Each domain page should list, per table: its purpose, and a column dictionary (Field | Type | Nullable | Meaning | Relationships | Allowed values | Notes), foreign keys, a data-flow note, and sample queries.
