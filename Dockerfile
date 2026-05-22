# syntax=docker/dockerfile:1
# Multi-stage build for AgentBox server

FROM node:22-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json biome.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/server/tsconfig.json apps/server/tsconfig.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/events/package.json packages/events/package.json
COPY packages/kv/package.json packages/kv/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/scanner/package.json packages/scanner/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/storage-local/package.json packages/storage-local/package.json
COPY packages/storage-s3/package.json packages/storage-s3/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/testkit/package.json packages/testkit/package.json

RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/server/src apps/server/src
COPY packages packages

# Build
RUN pnpm turbo build --filter @agentbox/app-server...

# ─── Runtime ───────────────────────────────────────────────────────────────────

FROM node:22-alpine AS runner

RUN addgroup -g 1001 -S agentbox && adduser -u 1001 -S agentbox -G agentbox

WORKDIR /app

# Copy built workspace — pnpm workspace symlinks require the full structure
COPY --from=builder --chown=agentbox:agentbox /app /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STORAGE_PATH=/data

VOLUME /data

EXPOSE 8080

USER agentbox

# Supports both "server" (default) and "migrate" subcommands
CMD ["node", "apps/server/dist/index.js"]
