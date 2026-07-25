# pnpm build (Phase 3 of the fleet pnpm migration — mirrors mi2-apps/stack-template).
# Node 24: pnpm v11 requires Node >= 22 (matches .nvmrc). corepack ships with Node and activates the
# exact pnpm pinned in package.json "packageManager". pnpm-workspace.yaml carries the supply-chain
# policy (allowBuilds / minimumReleaseAge / blockExoticSubdeps) and MUST be present in every stage
# that installs, so bcrypt's + esbuild's build scripts are allowed to run.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
# COREPACK_HOME is a world-readable shared dir so the pnpm activated by root below is usable by the
# unprivileged `node` user during install.
ENV COREPACK_HOME=/opt/corepack
# python3/make/g++ = C/C++ toolchain so bcrypt's native N-API binding can compile from source.
# bcrypt ships prebuilt binaries (via @mapbox/node-pre-gyp) for glibc only; on Alpine (musl) + Node
# 24 no prebuild matches, so node-gyp compiles it here. This stage is discarded, so the tools don't
# reach the final image. corepack enable/prepare run as root (they symlink into /usr/local/bin and
# populate COREPACK_HOME) BEFORE dropping to USER node.
RUN apk add --no-cache python3 make g++ \
    && mkdir -p "$COREPACK_HOME" \
    && corepack enable \
    && corepack prepare pnpm@11.17.0 --activate \
    && chmod -R a+rX "$COREPACK_HOME" \
    && chown node:node /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --frozen-lockfile is the pnpm equivalent of `npm ci` (fails on any package.json/pnpm-lock.yaml
# drift). All deps (incl. devDependencies) are installed so vite/tsc are available — pnpm does not
# drop devDeps under NODE_ENV=production, so no --include=dev is needed.
RUN pnpm install --frozen-lockfile

COPY --chown=node:node . .
RUN pnpm run build

# ── Stage 2: Producción ───────────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

# Actualizar paquetes del SO para parchear libcrypto3/libssl3
RUN apk upgrade --no-cache

# Solo dependencias de producción. bcrypt (dependencia de prod) recompila su binding nativo aquí, por
# eso se instala un toolchain virtual (.build-deps) que se elimina tras el install para mantener la
# imagen final ligera. --prod es el equivalente pnpm de `npm ci --omit=dev`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate \
    && apk add --no-cache --virtual .build-deps python3 make g++ \
    && pnpm install --frozen-lockfile --prod \
    && pnpm store prune \
    && apk del .build-deps

# Archivos compilados y configuración PM2
COPY --from=builder /app/dist ./dist
COPY ecosystem.config.cjs ./

# El servidor compilado (dist/server/server/index.js) resuelve "../client"
# como dist/server/client/ — mover el build del frontend ahí
RUN cp -r dist/client dist/server/client

# Directorios de uploads y logs (uploads debe montarse como volumen en Coolify)
RUN mkdir -p uploads logs && chown -R node:node /app

# Correr como usuario no-root
USER node

EXPOSE 3000

CMD ["node_modules/.bin/pm2-runtime", "ecosystem.config.cjs"]
