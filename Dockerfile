# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# NODE_ENV=production is injected by Coolify as a build arg and causes npm to
# skip devDependencies. Force --include=dev so vite/tsc are available.
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ── Stage 2: Producción ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Actualizar paquetes del SO para parchear libcrypto3/libssl3
RUN apk upgrade --no-cache

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

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
