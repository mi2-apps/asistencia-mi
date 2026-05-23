# stack-template

Starter template for MI Apps. Passes the 8/8 stack-conformance check
(React + TypeScript + Vite + Tailwind + Express + Drizzle + Postgres + PM2)
out of the box.

Policy reference: <https://apps.mi2.com.mx/launch>

## What's inside

| Check | File | Purpose |
|---|---|---|
| React | `package.json` (dep `react`) | UI library |
| TypeScript | `tsconfig.json` | Strict TS for the whole repo |
| Vite | `vite.config.ts` | Client bundler + dev server |
| Tailwind | `tailwind.config.ts` + `postcss.config.cjs` | Styling, with shadcn HSL CSS vars |
| Express | `package.json` (dep `express`) + `server/index.ts` | API server |
| Drizzle | `drizzle.config.ts` + `shared/schema.ts` | ORM, schema in `shared/` |
| Postgres | `package.json` (dep `pg`) | Database driver |
| PM2 | `package.json` (dep `pm2`) + `ecosystem.config.cjs` + `Procfile` | Process supervisor |

Layout: `client/` (Vite app) · `server/` (Express) · `shared/` (Drizzle schema).
Default port: 7000 (matches MI Manifest convention).

## How to use

1. Click **Use this template** on GitHub, name your new repo, set owner to `mi2-apps`.
2. Email `coolify01@mi2.com.mx` with your deployment request (see launch page for the form).
3. After Amir approves, push your code to the repo the bot created, reply `pushed`,
   and the deploy bot will launch you at `https://<your-app>.mi2.com.mx`.

## Validate before pushing

This template ships with `bin/check-stack`, the same conformance script the deploy
bot runs. Use it locally to catch issues before replying `pushed`:

```bash
./bin/check-stack                # check current repo (8/8 if you haven't broken anything)
./bin/check-stack /path/to/repo  # or check another path
./bin/check-stack --json         # machine-readable output for CI
```

Exit 0 means ready; exit 1 prints the missing items. Pure Python 3.8+, no deps.

Or fetch it standalone from the launch page:

```bash
curl -sSL https://apps.mi2.com.mx/launch/check-stack -o /tmp/check-stack
chmod +x /tmp/check-stack && /tmp/check-stack
```


## Required env vars (set in Coolify UI after launch)

- `DATABASE_URL` — Postgres connection string. The bot auto-injects this if you
  request a database in your deployment email.
- `NODE_ENV` — `production`
- `PORT` — `7000` (or whatever you tell the bot; PM2 reads this from `ecosystem.config.cjs`).
- Storage / API keys / Sentry DSN: see the launch page sections.

## Local dev

```bash
npm install
npm run dev          # client (5173) + server (7000) with HMR
```

## Build + run as Coolify does

```bash
npm run build        # builds client (Vite) + server (tsc)
npm start            # PM2-runtime from ecosystem.config.cjs
```

## Deviating from the template

If your app genuinely can't fit the stack (e.g. you need a Python library that
has no Node equivalent), request an exception in your deployment email. The
bot will block your launch otherwise; the rejection email lists the missing
pieces.

## Spec-Driven Development (SDD)

This template ships pre-configured with [GitHub Spec Kit](https://github.com/github/spec-kit).
The MI Apps stack-wide constitution lives at `.specify/memory/constitution.md` — Claude Code
consults it before every spec/plan/implement cycle.

Workflow:

```
/speckit-specify       # describe what to build (functional, not technical)
/speckit-plan          # architecture aligned with the constitution
/speckit-clarify       # resolve ambiguities (optional, recommended)
/speckit-tasks         # break plan into ordered tasks
/speckit-implement     # execute the tasks, open PR
```

Skills install at `.claude/skills/speckit-*/SKILL.md`. To bootstrap a fresh app from this
template, after cloning:

```bash
# Install the CLI once per machine (Python 3.11+, uv)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# In your app repo:
specify init . --ai claude --force      # already done in this template
```

See https://apps.mi2.com.mx/stack#sdd for the full pattern and rationale.
