# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder
WORKDIR /app

COPY src/package.json src/package-lock.json ./
RUN npm ci

COPY src/ ./
RUN npm run build

RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/skypulse.db

RUN mkdir -p /data && chown -R node:node /data
USER node

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Auto-seed on first start (no-op if the volume's DB already has rows), then
# `exec` so SIGTERM reaches Node directly for graceful shutdown.
CMD ["sh", "-c", "node dist/seed_db.js && exec node dist/server.js"]
