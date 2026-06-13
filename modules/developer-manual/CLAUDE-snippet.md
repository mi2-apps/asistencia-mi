<!-- Paste this section into your app's CLAUDE.md (under "Important Guidelines"). -->

### Developer Manual — keep it current (MANDATORY for every workflow)

The **Developer Manual** (`/developer-manual` + API `/api/v1/developer-manual/*`, agent path `/api/v1/external/developer-manual/*`, MCP at `/api/v1/external/developer-manual/mcp`) is the authoritative, machine-readable definition of the data model — every table, column, relationship, status enum, and business rule. AI agents and chatbots answer from it instead of guessing, so **it must never go stale.**

**Any change to the database schema or system architecture is NOT complete until the Developer Manual is updated in the same change** — humans and AI agents equally. Whenever you add/rename/drop a **table or column**, change a **relationship/FK**, add a **status value**, or introduce a **new subsystem**, before reporting the work done:
1. Update the affected domain page(s) — UI editor, `PUT /api/v1/developer-manual/pages/:id`, or (agents) the key-authed `/api/v1/external/developer-manual/*` write endpoints. Add a new page for a brand-new domain.
2. Refresh the structured data dictionary: `node scripts/seed-dev-manual.cjs <db>`.
3. Treat documentation drift as a bug — stale definitions make every downstream agent answer wrong.

**AI agents: add "update the Developer Manual" to your task checklist for any schema/architecture work and complete it before marking the task done.**
