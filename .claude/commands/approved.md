---
allowed-tools: Bash, Read, Edit, Grep, Glob, Task, WebFetch
argument-hint: "[patch|minor|major] [changelog-summary]"
description: Promote dev to production via the MI Apps Coolify workflow with full e2e verification AND a Developer-Manual + User-Manual + Changelog sync gate at each stage.
---

# /approved — MI Apps release workflow (Coolify-aware)

When the user invokes this command, drive a release through the full **dev → e2e → production → e2e** pipeline. This is the **only sanctioned path** from development to production on MI Apps. Never bypass with manual `git push` to master, `docker exec` into a container, or hand-edited Coolify env vars.

## Architecture (MI Apps, per /stack §15 + §17)

| Environment | Branch | URL | Auto-deploy |
|---|---|---|---|
| Local dev | feature branch | `localhost:5000` | `npm run dev` |
| **Dev site** | `dev` | `https://<slug>-dev.mi2.com.mx` | Coolify webhook on push to `dev` |
| **Production** | `master` | `https://<slug>.mi2.com.mx` | Coolify webhook on push to `master` |

- Both Coolify apps share the same GitHub repo (`mi2-apps/<slug>`).
- Coolify deploys each branch as a separate app with its own container + Postgres.
- The dev site is the gate: nothing reaches production unless the dev e2e suite passed.

> If the project doesn't have a dev site yet, run `/approved --provision-dev` first (see "Bootstrapping a dev site" at the bottom). The dev site is a **requirement** for the canonical workflow — going straight to master is allowed only for emergency hotfixes (and even then, the post-deploy e2e still runs).

## Parameters

- **version-type**: `patch` (default), `minor`, `major`
- **changelog-summary**: brief user-facing description (default: "Improvements and bug fixes")

```
/approved                                  → patch, default message
/approved patch "Fixed timezone bug"       → patch with summary
/approved minor "Added bulk-edit endpoint" → minor with summary
/approved major "Breaking: API v2 rollout" → major (asks for explicit confirmation)
```

## Workflow

Execute **in order**. **Stop and report on first failure.** Do not skip steps.

### Step 0 — Preflight

Verify the environment is sane before doing anything destructive:

1. **Clean working tree** — `git status` shows no uncommitted changes (or only changes the user explicitly wants in this release; ask if unclear).
2. **On a release-eligible branch** — current branch is `dev` or a feature branch that's been merged into `dev`. If you're on `master`, refuse — that means someone pushed to master out-of-band.
3. **Pulled remote** — `git fetch && git status -uno` confirms local is at or ahead of `origin/<branch>`.
4. **Stack conformance** — run `curl -sSL https://apps.mi2.com.mx/launch/check-stack | python3 - .`. Must **PASS the full conformance gate (11/11 as of 2026-06-25** — 9 stack checks + Developer Manual §14d + User Manual page §17a). If it fails, refuse — releases require conformance. (Note: the two doc checks are a HARD RULE for ALL apps from 2026-06-25; before then they're reported but non-blocking.)
5. **Major bump confirmation** — if `version-type=major`, explicitly confirm with the user before proceeding. Use `AskUserQuestion`.

### Step 1 — Calculate version

1. Read current version from `package.json`.
2. Compute next version by bumping `patch`/`minor`/`major`.
3. Show user: `Current: X.Y.Z → Next: X.Y.Z`.

### Step 2 — Update package.json

1. Edit the `version` field in `package.json`.
2. Confirm the change applied.

### Step 3 — Sync agents/stack metadata (if drifted)

If the project ships its own stack guide that mirrors `apps.mi2.com.mx/stack`, sync it now. Skip this step if the project doesn't have one. Most MI Apps projects don't — the canonical stack lives centrally at `apps.mi2.com.mx/stack`.

For projects that DO maintain their own `/stack` (e.g. mi-ai-manifest):
- Check if `.claude/agents/`, `.claude/skills/`, `.claude/commands/`, `.claude/settings.json` changed since the last release: `git diff $(git describe --tags --abbrev=0)..HEAD -- .claude/`
- If yes, propagate to whatever in-repo stack-guide files exist (e.g. `server/lib/stackContent.ts`, `client/src/components/stack-guide/*.tsx`).
- If the project has no in-repo stack mirror, file a `stack_change` suggestion at https://suggestions.mi2.com.mx so the central /stack picks up the change next.

### Step 4 — Local quality gate

Run the project's own quality checks. **All must pass.** Stop on first failure.

```bash
npm install --no-audit --no-fund     # bring node_modules to expected state
npm run check                        # tsc --noEmit
npm test                             # vitest run
npm run build                        # vite build + esbuild server
```

If any step fails, revert `package.json` version bump and STOP.

### Step 5 — Commit + tag

1. Stage the version bump + any stack sync changes:
   ```bash
   git add package.json package-lock.json [any stack files touched]
   ```

2. Create commit (use a heredoc for clean formatting):
   ```bash
   git commit -m "$(cat <<EOF
chore(release): vX.Y.Z

<changelog-summary>

🤖 Generated with /approved
EOF
)"
   ```

3. Tag (annotated):
   ```bash
   git tag -a "vX.Y.Z" -m "Release vX.Y.Z: <changelog-summary>"
   ```

### Step 5a — Docs, Manuals & Changelog gate (HARD RULE, per `/stack` §14d + §17a + §17b)

**No release ships without its knowledge captured.** This enforces the §14d *maintenance mandate*: when a release changes the data model or the UI, the **Developer Manual**, the **User Manual**, and the **Changelog** are updated **in the same release** — never "later." Stale manuals make every downstream agent and user confidently wrong.

**A. Classify what this release changed** — diff since the last tag and bucket the changes; this drives which artifacts are REQUIRED:

```bash
RANGE="$(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD"
git diff --name-only "$RANGE" | sort -u
```
- **Data-model change** — `migrations/`, `*.sql`, `shared/schema*`, `drizzle*`, OR new/renamed/dropped tables & columns, new status enums, changed relationships, new business rules.
- **User-visible change** — new/changed feature, screen, **modal**, form, **field**, or workflow (`client/**/*.tsx`, `components/`, `pages/`).
- **API change** — new/changed endpoints or request/response shapes.

**B. Developer Manual (§14d) — REQUIRED when the data model changed.**
Update the data dictionary + manual pages for EVERY new/renamed/dropped table & column, new status enum, changed relationship, and new business rule — capturing meaning, units/format quirks, allowed values, FK/join keys, and sample queries (not just the column name). Then **prove the dictionary is complete** — no undocumented columns:

```bash
# Every column in the live schema must have a data-dictionary entry. Any rows returned = undocumented = FAIL.
# (adjust the dictionary table name to your module: developer_manual_dictionary / dev_manual_dictionary)
psql "$DATABASE_URL" -tAc "
  SELECT c.table_name||'.'||c.column_name
  FROM information_schema.columns c
  LEFT JOIN developer_manual_dictionary d
    ON d.table_name = c.table_name AND d.column_name = c.column_name
  WHERE c.table_schema = 'public'
    AND c.table_name NOT LIKE 'developer_manual%'
    AND c.table_name NOT IN ('drizzle_migrations','session','changelog_entries','documentation_pages')
    AND d.column_name IS NULL;"
```
Any rows → the dev manual is stale → document those fields, then re-run until it returns empty. Delegate to the app's developer-manual maintainer agent if it has one. *(App has no §14d module yet? It must add one — §14d is a HARD RULE for all apps as of 2026-06-25; copy `mi2-apps/stack-template/modules/developer-manual`. Until integrated, keep an in-repo `docs/DATA-MODEL.md` current as the interim source.)*

**C. User Manual / docs page (§17a) — REQUIRED when a user-visible feature/modal/screen/field changed.**
A documentation page (EN + es-MX [+ zh-CN]) describing the new/changed feature for end users, linked from this release's changelog entry. A new modal, screen, or field is **not** "fix-only" — it needs a doc.

```bash
psql "$DATABASE_URL" -tAc "SELECT id, slug, title_en, updated_at FROM documentation_pages ORDER BY updated_at DESC LIMIT 5;"
```
Confirm a page was created/updated this release for the user-visible changes. Delegate to the `documentation` agent (writes the multilingual HTML body, inserts the row, links it via `related_documentation_page_id`). Pure-internal or genuine fix-only releases may skip.

**D. Changelog (§17b) — ALWAYS REQUIRED (every release).**
```bash
psql "$DATABASE_URL" -tAc "SELECT id, title_en, title_es FROM changelog_entries WHERE version = 'X.Y.Z';"
```
Missing → delegate to `changelog-manager` to generate it from git history (EN + ES) and insert the row. Block on completion.

**E. Gate.** If any REQUIRED artifact is missing for what this release changed → **STOP.** Revert the version bump + tag (if created) and do **not** push to `dev`. Report exactly which of {Developer Manual, User Manual, Changelog} is missing and for which change. Re-run after fixing.

> Why this is a hard gate: the **Developer Manual** is the ground truth agents query (§14d), the **User Manual** is what users read (§17a), the **Changelog** is the "what's new" (§17b). A release that updates code but not these three silently rots all three. (Apps that store docs in files instead of the DB tables: run the equivalent check against `CHANGELOG.md` / `docs/` and the in-repo data dictionary.)

### Step 6 — Push to dev

```bash
git push origin <current-branch>:dev    # if you were on a feature branch
git push origin dev                     # if you were on dev directly
git push origin --tags
```

Output to user: "Pushed to `dev` branch. Coolify webhook will deploy to `<slug>-dev.mi2.com.mx` in ~2-5 minutes."

### Step 7 — Wait for dev deploy + verify

1. **Poll Coolify's deployment queue** for completion. Either:
   - Query the Coolify API (if you have admin token): `GET /api/v1/applications/<dev-uuid>/deployments` and wait for status `finished`
   - Or watch the build log via `gh` if Coolify is set up to mirror to GitHub Actions
   - Or simply poll the URL with a smart retry: `until curl -fs -o /dev/null https://<slug>-dev.mi2.com.mx/api/health; do sleep 10; done`

2. **Verify version landed** on dev. If the app exposes `/api/health` or `/api/version`, check it returns the new version:
   ```bash
   curl -s https://<slug>-dev.mi2.com.mx/api/version | jq -r .version
   # expect: vX.Y.Z
   ```

3. **If dev deploy fails** — STOP. Report the Coolify deployment_uuid + the failing build log to the user. The `deploy_watcher` cron will also email the owner; both signals should arrive.

### Step 8 — Run full e2e against dev site

This is the gate. If e2e fails on dev, **nothing goes to production.**

**Option A — Project-local Playwright:**
```bash
PLAYWRIGHT_BASE_URL=https://<slug>-dev.mi2.com.mx \
  npx playwright test --reporter=list,json
```

**Option B — Delegate to the `frontend-testing` agent** (see /stack §18). It produces a structured pass/fail report with screenshots.

**Option C — Use the platform's e2e-tester** if your app is registered in `/home/master/e2e-tests/tests/apps.spec.ts`:
```bash
ssh master@192.168.15.204 "/home/master/e2e-tests/run-e2e.sh <slug>-dev --json"
```

**Acceptance criteria:**
- All tests pass
- No new console errors compared to the previous release's snapshot
- All critical-path tests (auth, primary CRUD, payment if any) explicitly green

**If e2e fails on dev:**
1. STOP.
2. Output the failing test names + screenshot paths.
3. Revert the local commit (`git reset --hard HEAD~1`) and the tag (`git tag -d vX.Y.Z`). Inform the user the release is rolled back.
4. Delete the remote tag if you pushed it: `git push origin :refs/tags/vX.Y.Z`.
5. Leave the dev branch deployed (it's the dev branch — that's its purpose). Investigate the failure.

### Step 8a — QA coverage gate (pre-publish, `/stack` §16a + suggestion #9)

Before promoting to production, confirm the QA Runner has a **passing run within the last 30 days** for this app. This is the pre-publish half of the 30-day coverage policy (the daily `qa_coverage_sweep` keeps apps fresh *between* releases; this gate checks *at* release).

```bash
ssh master@192.168.15.204 "python3 ~/.config/coolify-bot/qa_publish_gate.py <slug> prod"
```

- **PASS** — a fresh passing run exists → continue to Step 9.
- **WARN** — not publishable, but before the enforce date (`2026-07-18`) → **advisory**, the release still proceeds. Trigger a fresh QA run so you're green before the gate starts blocking: `POST https://qa.mi2.com.mx/api/v1/runs {"app":"<slug>","env":"prod"}`.
- **BLOCK** (exit 2, on/after the enforce date) — refuse to promote. Trigger a QA run, wait for it to pass, then re-run this gate.
- **Out of scope** — apps not yet QA-onboarded (no `/coverage` row) PASS automatically; onboarding to the QA Runner is what opts an app into the gate.

The gate **fails open**: if the QA Runner is unreachable it warns and lets the release through, so a QA outage never wedges all releases.

> Runway: warn-only until **2026-07-18**, blocking thereafter — mirrors the docs conformance gate's date-gated rollout. Today it's advisory; wire it in now so it's already part of muscle memory when it starts blocking.

### Step 9 — Promote dev → master

Only reached if Step 8 passed **and** Step 8a did not BLOCK.

```bash
git checkout master
git pull origin master
git merge --ff-only dev          # fast-forward; if not possible, rebase dev onto master first
git push origin master
git push origin --tags
```

If fast-forward fails because someone pushed to master out-of-band: STOP. That's an out-of-process change; reconcile manually before continuing.

### Step 10 — Wait for production deploy + verify

Same poll pattern as Step 7, but against the production URL:

```bash
until curl -fs -o /dev/null https://<slug>.mi2.com.mx/api/health; do sleep 10; done

curl -s https://<slug>.mi2.com.mx/api/version | jq -r .version
# expect: vX.Y.Z
```

### Step 11 — Run e2e against production

Same as Step 8 but targeting the prod URL. Use the platform's e2e-tester if registered (`/home/master/e2e-tests/`); it's the same suite the `deploy_watcher` cron runs post-deploy automatically, so this step often races with that cron — either is fine.

If prod e2e fails:
1. STOP. Production is in a bad state.
2. Decide: roll back via Coolify (redeploy the previous tag) or roll forward with a hotfix.
3. Notify `@coolify-manager` on Mattermost #coolify-ops.
4. The platform's `deploy_watcher` will also email you; both signals confirm the bad state.

### Step 12 — Submit changelog entry

Either commit a `CHANGELOG.md` update in the repo (preferred for projects with one) **or** post to the central suggestions API:

```bash
curl -X POST https://suggestions.mi2.com.mx/api/suggestions \
  -H "Authorization: Bearer $SUGGESTIONS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "kind": "stack_change",
  "source": "<your-email>",
  "title": "<slug> vX.Y.Z released",
  "reason": "<changelog-summary>",
  "affected_apps": ["<slug>"],
  "payload": { "version": "vX.Y.Z", "type": "release_announcement" }
}
EOF
)"
```

The dedicated `changelog-manager` agent can handle this step end-to-end — delegate via `Task` if available.

### Step 13 — GitHub Release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "$(cat <<EOF
## Summary
<changelog-summary>

## Verified
- ✅ Dev e2e passed (https://<slug>-dev.mi2.com.mx)
- ✅ Prod e2e passed (https://<slug>.mi2.com.mx)
EOF
)"
```

### Step 14 — Report success

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Release vX.Y.Z shipped successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Version:     X.Y.Z (was X.Y.Z-1)
  Dev:         ✓ deployed + e2e passed   https://<slug>-dev.mi2.com.mx
  Prod:        ✓ deployed + e2e passed   https://<slug>.mi2.com.mx
  Dev Manual:  ✓ updated (§14d) — dictionary complete, 0 undocumented columns
  User Manual: ✓ updated (§17a) — doc page for new feature(s)
  Changelog:   ✓ entry for vX.Y.Z (§17b) + submitted
  GitHub:      ✓ release vX.Y.Z published

Next:
  - Monitor Sentry for new errors over the next hour
  - Watch deploy_watcher's post-deploy e2e in your inbox
  - If anyone reports issues, /checkbug or hand to the debugging agent
```

## Bootstrapping a dev site (one-time)

If `<slug>-dev.mi2.com.mx` doesn't exist yet, you can't run `/approved` until it does. Set it up by emailing `coolify01@mi2.com.mx`:

```
Subject: Dev site request: <your-slug>

Please provision a dev-branch Coolify app:
- Source: same GitHub repo as production (<slug>)
- Branch: dev
- Domain: <slug>-dev.mi2.com.mx
- Database: separate per-app Postgres (the dev DB is throwaway-safe)
- Build pipeline: opt-in to coolify-build-01 (the build server)
- SES: not needed if the prod app already has it (share if cheap, separate if not)
```

Amir provisions the second Coolify app pointing at the `dev` branch. You then `git checkout -b dev && git push -u origin dev` from your prod branch's tip to seed it.

Once the dev site exists, `/approved` works as documented above. The 8/8 conformance gate (`/stack` §2) is a hard prerequisite; the dev site is a soft prerequisite (recommended but bypassable for emergency hotfixes).

## Safety rules

- **NEVER** `git push --force` to dev or master.
- **NEVER** `git reset --hard` on a branch that has been pushed.
- **NEVER** skip Step 8 (dev e2e) — that's the whole point of the dev site.
- **NEVER** skip Step 11 (prod e2e) — even if dev e2e passed, prod has different env vars, different network, different load.
- **NEVER** edit a running Coolify container directly. The webhook is the only sanctioned path.
- **NEVER** rotate `SESSION_SECRET` or other auth secrets as part of a routine release — that invalidates active sessions. Do those changes in a dedicated maintenance window with user notice.
- **`--no-verify` (skipping hooks) is forbidden** unless the user explicitly authorizes for this specific release.

## Integration with other agents

- **`full-stack-developer`** — produces the feature commits you're releasing
- **`frontend-testing`** — provides the e2e gate in Steps 8 + 11
- **developer-manual maintainer** — updates the §14d data dictionary + pages in Step 5a (the maintenance mandate); the per-app dev-manual module exposes the data layer + MCP tools it uses
- **`documentation`** — writes the multilingual §17a user-manual docs page in Step 5a
- **`changelog-manager`** — generates the §17b changelog entry in Step 5a + the announcement in Step 12
- **`github-manager`** — handles the commit / tag / release plumbing (Steps 5, 13)
- **`@coolify-manager`** (Mattermost) — escalation when Coolify deployment misbehaves

## Customize for your project

- **Quality gate (Step 4)**: add `npm run lint`, custom tests, or smoke commands your project requires.
- **e2e selection (Step 8/11)**: pick Option A/B/C based on whether your project ships its own Playwright suite or relies on the platform's `/home/master/e2e-tests/`.
- **Changelog (Step 12)**: commit to a repo CHANGELOG.md if you maintain one; otherwise rely on the central suggestions API.
- **Version policy**: this command assumes semver. If your project uses date-based versioning or another scheme, adjust Step 1.
- **Hotfix path**: when production is on fire and the dev gate would slow you down, document a `--hotfix` mode that pushes directly to master, runs prod e2e immediately, and rolls back automatically if e2e fails. Disabled by default; needs `--hotfix` flag.
