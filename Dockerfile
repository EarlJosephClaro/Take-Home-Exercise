# syntax=docker/dockerfile:1

# ─── Stage 1: build ────────────────────────────────────────────────────────
# Compile TypeScript and install production dependencies. build-essential +
# python3 are present so better-sqlite3 can compile its native addon if a
# prebuilt binary isn't available for this platform.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install all deps against the lockfile first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Build the TypeScript sources.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies so only runtime deps are carried to the final image.
RUN npm prune --omit=dev

# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/urls.db

# Persistent, writable location for the SQLite file, owned by the node user.
RUN mkdir -p /data && chown node:node /data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY package.json ./

USER node
EXPOSE 8787
VOLUME ["/data"]

# Use the /health endpoint for container health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8787)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
