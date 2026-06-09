# MI Apps Constitution

This constitution governs every application on the MI Apps platform (apps deployed via
COOLIFY-01 to `*.mi2.com.mx`). Claude Code consults this file before every `/speckit-specify`,
`/speckit-plan`, and `/speckit-implement`. Rules below labelled **HARD RULE** are non-negotiable
and gated by the conformance check at https://apps.mi2.com.mx/launch.

The canonical, machine-readable version of all platform rules lives at:
https://apps.mi2.com.mx/stack — pull `/stack/version.json` at the start of every session
and compare against the project's `stack_last_synced` marker.

---

## Core Principles

### I. Single Stack (HARD RULE)

Every app converges on the same approved stack: React 18 + TypeScript 5 + Vite + Tailwind
+ shadcn/ui on the frontend; Express + Drizzle ORM + PostgreSQL + PM2 on the backend.
Off-stack choices (different ORM, different DB, different runtime) require explicit
approval from Amir and are documented as exceptions in the stack-page. Conformance is
gated by the 8/8 check at `/launch/check-stack` — new apps cannot deploy until they pass.

See: https://apps.mi2.com.mx/stack#conformance

### II. SSO via Nextcloud (HARD RULE)

No per-app login screens. No OAuth setups against Google/GitHub/Microsoft. Every app
uses `cloud.miglobal.com.mx` as its OIDC provider. Provision via:
```
provision-app-sso <slug>
```
Apps store `oidc_sub` on the users table and dedupe by email. Sessions persist in
Postgres via `connect-pg-simple`.

**User-facing identity URLs** — link to these from your UI, do NOT build app-local equivalents:
- **Password reset:** `https://cloud.miglobal.com.mx/apps/user_backend_sql_raw/reset-password`
  — wire into your "Forgot password?" link. The provisioner response includes this as
  `password_reset_url` on every reply; read it from the payload rather than hardcoding.
- **Welcome landing for newly migrated users:** `https://cloud.miglobal.com.mx/migrated`
  — covers Talk, Files, Calendar, Mail+AI, phone + computer setup.

**Dual-domain email alias (HARD RULE).** Nextcloud OIDC may emit either
`@miglobal.com.mx` OR `@mitechnologiesinc.com` for the SAME logical user. Any per-user
authorization gate (`allowed_users`, superuser set, admin allowlist) MUST treat the two
as equivalent — use `canonicalizeEmail()` + `allDomainVariants()` from `shared/email-alias.ts`,
never compare the raw OIDC email to a single stored string. Personal addresses (gmail, etc.)
are NEVER valid SSO identities — MI-domain accounts only. See: https://apps.mi2.com.mx/stack#email-alias

See: https://apps.mi2.com.mx/stack#sso

### III. Trilingual UI (HARD RULE)

Every app ships UI in three languages from day one — no exceptions, no "add Chinese
later":
- `en` — English (default + fallback)
- `es-MX` — Mexico Spanish specifically (NOT generic `es`)
- `zh-CN` — Mainland Simplified Chinese (NOT `zh-TW` Traditional)

Locale folders at `client/public/locales/{en,es-MX,zh-CN}/`. UI has a 3-button switcher
persisting choice in localStorage. Machine translation acceptable as first pass; mark
the file as `machine-translated` in a comment.

See: https://apps.mi2.com.mx/stack#i18n

### IV. User Documentation + Changelog (HARD RULE)

Every app serves `/documentation` and `/changelog` HTML pages backed by Postgres tables
(see /stack §17a + §17b for schemas). Release blocked by `/approved` Step 5a if either
is missing. The `documentation` and `changelog-manager` agents handle the database
inserts on the `/approved` flow.

See: https://apps.mi2.com.mx/stack#documentation and #changelog

### V. Cost-Aware Model Routing

Default to Claude Haiku for mechanical work (summarization, translation, simple
classification, code formatting). Escalate to Sonnet only when reasoning is required.
Reserve Opus for genuinely hard problems (cross-codebase refactors, novel architecture,
complex debugging). The agent YAMLs in `.claude/agents/` already encode this — don't
override per-call without a reason.

See: https://apps.mi2.com.mx/stack#model-routing

### VI. Spec-Driven Development (RECOMMENDED)

For anything bigger than a one-file tweak, use spec-kit (this directory):
1. `/speckit-constitution` — only when adding project-specific principles. The
   stack-wide rules in THIS file are not removable.
2. `/speckit-specify` — describe what to build (functional, not technical)
3. `/speckit-plan` — Claude proposes architecture aligned with the constitution
4. `/speckit-clarify` — Claude flags ambiguities; you resolve them
5. `/speckit-tasks` — Claude breaks the plan into ordered tasks
6. `/speckit-implement` — Claude executes, opens PR

Artifacts land in `specs/<NNN>-<feature-slug>/{spec,plan,tasks,data-model}.md`.
The `/approved` workflow checks that the relevant `spec.md` exists and is referenced
in the changelog entry for the version that ships it.

Skip SDD for: typo fixes, version bumps, copy edits, single-file bug fixes.

See: https://apps.mi2.com.mx/stack#sdd

### VII. Daily Stack Sync

The platform changes faster than agents read it. The first action of every new Claude
Code session in an MI app:
```
curl -sSL https://apps.mi2.com.mx/stack/version.json | jq
```
Compare `updated_at` against this project's `stack_last_synced` marker (in this app's
CLAUDE.md or a similar file). If newer, read `/stack` and propagate any rule changes
into this constitution before doing any other work.

See: https://apps.mi2.com.mx/stack#daily-sync

### VIII. Observability (Sentry)

Every app is provisioned with a Sentry project (`provision-app-sentry <slug>`). DSN
lives in env vars. Frontend + backend both initialize the SDK. PII filtering is the
team `apps` default in the `mi-technologies-inc` Sentry org.

See: https://apps.mi2.com.mx/stack#sentry

### IX. File Storage (MinIO, isolated per app)

If your app needs file/image storage, provision an isolated MinIO bucket via
`provision-app-storage <slug>`. Endpoint at `192.168.15.250:9000`; public access via
`https://s3.mi2.com.mx`. Use the AWS SDK with `forcePathStyle: true` and
`AWS_ENDPOINT_URL_S3` pointing at the MinIO endpoint.

See: https://apps.mi2.com.mx/stack#storage

---

## Governance

This constitution is loaded from `.specify/memory/constitution.md` by spec-kit before
every spec/plan/implement cycle. To change a project-specific principle (anything below
this section), run `/speckit-constitution`. The HARD RULES above (Principles I–IV +
VII–IX) are inherited from the platform and updating them requires:
1. A `stack_change` proposal at https://suggestions.mi2.com.mx
2. Amir's approval
3. Update propagation across the stack-template + announcement to all app owners

Do NOT delete or weaken HARD RULES locally — the conformance gate at `/launch` will
reject the redeploy.

**Version:** 1.0 (aligned with stack v3.22.6+mi)
**Ratified:** 2026-05-22

---

## Project-Specific Principles

<!--
Add project-specific principles below. Examples:

### X. <Your Principle>
<description>

Keep these scoped to THIS app. Anything that should apply to all MI apps belongs in
the stack constitution (this file's HARD RULES section), not here. Propose stack-wide
changes via https://suggestions.mi2.com.mx.
-->

_(none yet — add via `/speckit-constitution` if your app needs custom principles)_
