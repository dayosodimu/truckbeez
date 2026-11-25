# syntax=docker/dockerfile:1.7
#
# TruckBeez API — one Dockerfile, two kinds of container:
#   --target test     → unit-test container (runs typecheck + Vitest, then exits)
#   --target runtime  → the deployable image. The SAME image digest is promoted
#                       staging → preprod → prod; only env vars/secrets differ.
#
# Build context is the REPO ROOT (ADR-0003 step B), because the API depends on the
# @truckbeez/shared workspace package:
#   docker build -f services/api/Dockerfile --target runtime .
#
# Pin the base image by digest in CI once the first build has run, e.g.
#   node:22.15-alpine3.21@sha256:<digest>

ARG NODE_IMAGE=node:22-alpine

# ---------- manifests: only what npm needs to resolve the workspace tree ----------
# Each workspace's package.json is copied explicitly (never a glob: a glob that
# matches nothing fails the build), never their sources.
# apps/mobile/package.json is deliberately NOT copied (step E): with it present,
# npm ci's --workspace filter keeps packages hoisted for the app (typescript,
# terser, lightningcss, …) in the API's production install. Without it, npm ci
# still checks the lockfile and installs only what the API and shared need.
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/

# ---------- deps: full dependency tree (dev + prod) for the API and shared ----------
FROM manifests AS deps
# npm ci from the committed lockfile (BR-46). --ignore-scripts: no dependency
# install script runs in the build (supply-chain hardening, PR #10 review M3).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund \
      --workspace @truckbeez/api --workspace @truckbeez/shared
COPY packages/shared/tsconfig*.json packages/shared/
COPY packages/shared/src packages/shared/src
RUN npm run build --workspace @truckbeez/shared

# ---------- test: unit-test container ----------
FROM deps AS test
ENV APP_ENV=unit \
    CI=true
WORKDIR /app/services/api
COPY services/api/tsconfig*.json services/api/vitest.config.ts services/api/eslint.config.js ./
COPY services/api/src ./src
COPY services/api/test ./test
COPY services/api/scripts ./scripts
# Default command: typecheck, lint, then the unit suite. JUnit report is written to
# /app/services/api/reports so CI can mount it out with -v. CI runs each gate as its own step.
CMD ["sh", "-c", "npm run typecheck && npm run lint && npm run test:unit"]

# ---------- build: compile TypeScript ----------
FROM deps AS build
WORKDIR /app/services/api
COPY services/api/tsconfig*.json ./
COPY services/api/src ./src
RUN npx tsc -p tsconfig.build.json

# ---------- prod-deps: production dependencies only, from the same lockfile ----------
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
      --workspace @truckbeez/api --workspace @truckbeez/shared
# Guard: build tooling and app-only packages never reach the runtime image.
RUN for pkg in typescript vitest eslint tsx jest terser lightningcss metro react react-native expo @babel/core @expo/cli; do \
      if [ -e "node_modules/$pkg" ]; then echo "prod-deps: unexpected $pkg in the API production install" >&2; exit 1; fi; \
    done

# ---------- runtime: minimal, non-root, production image ----------
FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="truckbeez-api" \
      org.opencontainers.image.source="https://github.com/dayosodimu/truckbeez" \
      org.opencontainers.image.revision="${APP_VERSION}"
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000
# tini = proper PID 1 so SIGTERM reaches node and connections drain on deploy.
# npm/npx/corepack ship in the base image but are never used at runtime (CMD is
# plain node). Removing them drops their bundled dependencies, which carry
# HIGH CVEs (pacote, sigstore, ip-address, brace-expansion, picomatch), and
# leaves no package manager inside the production container.
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
# Workspace layout is kept so node_modules/@truckbeez/shared (a symlink) resolves.
# Files stay root-owned: the non-root `node` user can read but never rewrite its code.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/services/api/dist ./services/api/dist
COPY services/api/package.json ./services/api/
WORKDIR /app/services/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
