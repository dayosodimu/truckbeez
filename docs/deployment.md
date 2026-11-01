# Container environments: unit → staging → pre-production → production

Every TruckBeez backend environment runs in Docker containers. The API image is
**built once**, tested, scanned, and the **same digest** is promoted through each
environment. Environments differ only in configuration and secrets.

```
 PR / push ──► [unit]  test container (typecheck + Vitest, no network)
                 │
 push to main ─► build runtime image ─► Trivy scan ─► push ghcr.io/dayosodimu/truckbeez-api@sha256:…
                 │
                 ├─► [staging]   auto deploy · seeded data · Stripe test mode
                 ├─► [preprod]   auto deploy · prod-mirror (3 replicas, prod limits) · anonymised data
                 │               release-candidate suites: @smoke, @routing-safety, k6
                 └─► [prod]      required reviewer approval · managed Postgres/Redis
```

## Environments at a glance

| | unit | staging | preprod | prod |
|---|---|---|---|---|
| Container | `test` stage | `runtime` image | same digest | same digest |
| Trigger | every PR + push | merge to `main` | after staging succeeds | after preprod + approval |
| API replicas | 1 (exits) | 1 | 3 | 3 |
| CPU / memory per replica | — | 0.5 / 512M | 1.0 / 1G | 1.0 / 1G |
| Postgres + PostGIS | none | container | container | **managed** (PITR) |
| Redis | none | container | container | **managed** |
| Network | `none` | internal + edge | internal + edge | internal + edge |
| Data | none | seeded fixtures | anonymised prod-shaped | live |
| Compose files | `compose.unit.yaml` | base + data + staging | base + data + preprod | base + prod |

## Files

| Path | Purpose |
|---|---|
| `services/api/Dockerfile` | Multi-stage: `deps` → `test` (unit container) → `build` → `runtime` (non-root, tini, healthcheck) |
| `deploy/compose.unit.yaml` | Unit-test container, no network, JUnit to `reports/api/` |
| `deploy/compose.base.yaml` | Shared API + nginx edge definition for deployed environments (read-only FS, dropped caps) |
| `deploy/compose.data.yaml` | Postgres/PostGIS + Redis containers (staging & preprod only) |
| `deploy/compose.{staging,preprod,prod}.yaml` | Per-environment replicas, limits, restart policy, `APP_ENV` |
| `deploy/nginx/edge.conf` | Load-balances API replicas; WebSocket upgrade for `/ws/` live tracking |
| `deploy/env/*.env.example` | Templates only — real `.env` files are git-ignored |
| `deploy/deploy.sh` | Deploy a digest to one environment; verifies health; **auto-rollback** to last good image |
| `.github/workflows/ci-cd.yml` | Pipeline: unit → build/scan/push → staging → preprod → prod |
| `.github/workflows/deploy.yml` | Reusable SSH deploy job per GitHub environment |

## Running locally

```bash
# Unit tests in a container
docker compose -p truckbeez-unit -f deploy/compose.unit.yaml run --rm --build api-unit

# A staging-like stack on your machine
docker build --target runtime -t truckbeez-api:local services/api
cp deploy/env/staging.env.example deploy/env/staging.env
bash deploy/deploy.sh staging truckbeez-api:local   # mutable tags are allowed for staging only
curl localhost:8080/version
```

## One-time setup

1. **Generate the lockfile** and commit it: `cd services/api && npm install` → commit `package-lock.json`
   (the Dockerfile switches to `npm ci` automatically once it exists).
2. **Hosts:** one Docker host (or VM) per deployed environment, with Docker Engine + Compose v2,
   a deploy user in the `docker` group, and the edge port reachable only from the load balancer.
3. **GitHub environments** (`Settings → Environments`): create `staging`, `preprod`, `production`.
   - Secrets in each: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `ENV_FILE`
     (full contents of that environment's `.env`).
   - Variable: `PUBLIC_URL` (enables the external smoke check).
   - `production`: add **required reviewers** and restrict deployment branches to `main`.
   - Recommended: also restrict `preprod` to `main`.
4. **Registry:** images go to GHCR (`ghcr.io/dayosodimu/truckbeez-api`) using the workflow's `GITHUB_TOKEN`.

## Promotion and rollback rules

- Only `@sha256:` digests may be deployed to preprod and prod (`deploy.sh` refuses tags).
- A failed health check or `/version` check rolls back to the last good image for that environment
  (`deploy/.last-good-image.<env>` on the host).
- Manual rollback: re-run `deploy.sh <env> <previous-digest>` or re-run an older successful workflow's deploy job.
- DB migrations run as a separate one-off container before `up` (hook in `deploy.sh`), and must be
  backward compatible with the previous image so rollback stays safe.

## Not yet wired (follow-ups)

- Pin `actions/checkout` / `actions/upload-artifact` and the base images by SHA/digest.
- Plug the QA release-candidate suites into the preprod step (`truckbeez-qa-automation-engineer`).
- Move env secrets from GitHub environment secrets to a cloud secrets manager with OIDC
  (`truckbeez-security-engineer` / `truckbeez-devops-specialist`), and wire Terraform for hosts and managed data stores.
- Add `routing-service`, `tracking-gateway` and `workers` images using the same Dockerfile pattern.
