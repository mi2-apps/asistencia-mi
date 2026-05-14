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
