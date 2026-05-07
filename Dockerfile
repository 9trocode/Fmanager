FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable

# --- deps: install all (compiles better-sqlite3 native binding)
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ linux-headers
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder: produce .next standalone output
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- runner: minimal runtime image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=/data/app.db

RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nextjs && \
    mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migration files + the runtime migrate script + entrypoint. The migrate
# script imports drizzle-orm and better-sqlite3 from the standalone's
# bundled node_modules (Node walks up from /app/scripts to /app/node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/entrypoint.sh ./scripts/entrypoint.sh

# Transitive runtime deps that Next's tracing can't capture because pnpm
# only places them under `.pnpm/`. better-sqlite3 dynamically requires
# `bindings`, which in turn requires `file-uri-to-path`. We copy the actual
# package contents to the flat layout Node expects at /app/node_modules/.
COPY --from=deps --chown=nextjs:nodejs \
  /app/node_modules/.pnpm/bindings@1.5.0/node_modules/bindings \
  /app/node_modules/bindings
COPY --from=deps --chown=nextjs:nodejs \
  /app/node_modules/.pnpm/file-uri-to-path@1.0.0/node_modules/file-uri-to-path \
  /app/node_modules/file-uri-to-path

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Apply migrations then start the server. Migrations are idempotent so
# repeated boots are safe.
ENTRYPOINT ["/bin/sh", "/app/scripts/entrypoint.sh"]
