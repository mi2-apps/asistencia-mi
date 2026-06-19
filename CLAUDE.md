# asistencia-mi — Sistema de Control de Asistencia

**MI Technologies** — Quality Department attendance tracking system.

## Stack
- **Frontend**: React 18 + TypeScript + Vite 5 + Tailwind 3 + shadcn/ui + wouter + TanStack Query v5 + Zustand + react-i18next
- **Backend**: Express + TypeScript + Drizzle ORM + PostgreSQL
- **Auth**: Passport.js OIDC via Nextcloud SSO (`cloud.miglobal.com.mx`) — NO local JWT
- **Deploy**: PM2 → Coolify → `asistencia.mi2.com.mx`

## Dev

```bash
# from asistencia-mi/
npm install
cp .env.example .env   # fill DATABASE_URL + OIDC vars
npm run dev            # Vite :5173 + Express :3000 concurrently
```

## Key architecture rules

1. **Auth**: Sessions via Passport + connect-pg-simple. `req.isAuthenticated()` gates all `/api/v1/*` routes. Never use localStorage JWT.
2. **Soft-delete**: colaboradores `activo=false` + `tipo_baja` + `fecha_baja` + `motivo_baja`. Reactivar → set all 3 to NULL.
3. **XOR asistencia**: every `asistencia` row has EXACTLY ONE of (`usuario_id`, `colaborador_id`) — enforced by CHECK constraint.
4. **Idempotent attendance**: POST asistencia uses `FOR UPDATE` → UPDATE if exists, INSERT if not.
5. **Username autogen**: `normalize(nombre).normalize(apellido)` NFD no-diacritics, numeric suffix on dup.
6. **Future week block**: `semanaOffset >= 0` → "siguiente semana" button disabled.
7. **Admin protection**: username `admin` cannot be deleted (client + server enforced).
8. **Partial unique index**: `colaboradores.numero_empleado` UNIQUE WHERE NOT NULL.
9. **Trilingual**: EN / ES-MX / ZH-CN. All UI strings in `client/public/locales/{lng}/`.

## Folder structure

```
asistencia-mi/
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/          # one file per module
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   └── ui/
│   │   ├── stores/         # Zustand
│   │   ├── hooks/
│   │   └── lib/
│   └── public/
│       └── locales/{en,es-MX,zh-CN}/
├── server/
│   ├── index.ts
│   ├── db.ts
│   ├── auth/
│   ├── routes/
│   └── middleware/
├── shared/
│   ├── schema.ts           # Drizzle schema (source of truth)
│   ├── validators.ts       # Zod schemas
│   └── constants.ts        # departments, puestos, colors, enums
└── drizzle/                # generated migrations
```

## Hard rules (from MI Apps stack)
- 12/12 conformance: React 18, TS, Vite 5, Tailwind, Express, Drizzle, pg, PM2, mobile-ready, Developer Manual, User Manual, Changelog
- "What's New" modal on first login after deploy
- Mobile-first, tap targets ≥ 44px
