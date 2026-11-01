# syntax=docker/dockerfile:1.7
#
# TruckBeez API — one Dockerfile, two kinds of container:
#   --target test     → unit-test container (runs typecheck + Vitest, then exits)
#   --target runtime  → the deployable image. The SAME image digest is promoted
#                       staging → preprod → prod; only env vars/secrets differ.
#
# Pin the base image by digest in CI once the first build has run, e.g.
#   node:22.15-alpine3.21@sha256:<digest>

ARG NODE_IMAGE=node:22-alpine

# ---------- deps: full dependency tree (dev + prod) ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci when a lockfile is committed (required for reproducible builds).
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- test: unit-test container ----------
FROM deps AS test
ENV APP_ENV=unit \
    CI=true
COPY tsconfig*.json vitest.config.ts ./
COPY src ./src
COPY test ./test
# Default command runs the unit suite; JUnit report is written to /app/reports
# so CI can mount it out with -v.
CMD ["sh", "-c", "npm run typecheck && npm run test:unit"]

# ---------- build: compile TypeScript ----------
FROM deps AS build
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# ---------- runtime: minimal, non-root, production image ----------
FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="truckbeez-api" \
      org.opencontainers.image.source="https://github.com/dayosodimu/truckbeez" \
      org.opencontainers.image.revision="${APP_VERSION}"
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000
WORKDIR /app
# tini = proper PID 1 so SIGTERM reaches node and connections drain on deploy.
# npm/npx/corepack ship in the base image but are never used at runtime (CMD is
# plain node). Removing them drops their bundled dependencies, which carry
# HIGH CVEs (pacote, sigstore, ip-address, brace-expansion, picomatch), and
# leaves no package manager inside the production container.
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
