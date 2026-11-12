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
| `services/api/src/errorReporting/` | Sentry init (off unless `SENTRY_DSN` is set) and the privacy scrubber for every event |
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

## Error and crash reporting (Sentry)

The API reports unhandled errors (5xx responses, uncaught exceptions, unhandled rejections) to
Sentry with the Node SDK (`@sentry/node` v11). Reporting is **off unless `SENTRY_DSN` is set**, so
unit tests and local runs never send anything.

| Sentry field | Source |
|---|---|
| `environment` | `APP_ENV` (`staging`, `preprod`, `prod`) |
| `release` | `APP_VERSION`: the git SHA passed as the Docker build arg, so an issue maps to one image digest |
| tags | `method`, `route` (the template, e.g. `/v1/routes/:id`, never the raw URL), `status` |

Clients get `{"error": "Something went wrong", "reference": "<event id>"}` for a 500 and never a
message, stack trace or echo of the request. 4xx errors are answered (`Bad request` / `Not found`)
but not reported.

### Privacy: what is never sent

Driver location is personal data (CLAUDE.md). Three layers keep it, PII and secrets out of Sentry:

1. **SDK collects almost nothing.** `defaultIntegrations: false` and an allowlist of integrations that
   do not read requests, console output, outgoing HTTP URLs or local variables. Every v11
   `dataCollection` category is off (v11 collects everything when it is unset). No tracing:
   distributed tracing goes through OpenTelemetry separately.
2. **`beforeSend` / `beforeBreadcrumb` scrubber** (`src/errorReporting/scrub.ts`, unit-tested) on every event:
   - drops request bodies, cookies, query strings, `user`, stack-frame variables and all headers
     except `content-type`, `content-length` and `accept`; the request URL is cut to origin and path;
   - replaces values of location keys (`lat`, `lng`, `lon`, `latitude`, `longitude`, `coordinates`,
     `position`, `geometry`, `waypoints`, …), `[lng, lat]` arrays and coordinate-looking text
     (`41.12345,-87.65432`, `lat=…`) with `[Filtered]` / `[coords]`;
   - replaces credentials (`authorization`, `cookie`, `password`, `token`, `api_key`, `signature`,
     `email`, `phone`, …), `key=`/`token=`/`apikey=` query parameters, URL passwords, bearer tokens
     and the **value of every secret-looking env var** (`SENTRY_DSN`, `DATABASE_URL`, `*_API_KEY`, …).
3. **Sentry project settings (server-side backstop):** turn on *Data Scrubber* and *Use Default
   Scrubbers*, turn off *Store client IP addresses*, and add `lat`, `lng`, `latitude`, `longitude`,
   `coordinates` to *Additional Sensitive Fields*.

Adding a new field that carries location or identity? Add its key to the scrubber and a test in
`services/api/test/scrub.test.ts` in the same PR.

### One-time setup (owner)

1. Create a Sentry organisation (EU or US data region, decided with `truckbeez-security-engineer`
   for driver-data residency) and one project **`truckbeez-api`** (platform: Node.js / Express).
2. Apply the project settings from layer 3 above.
3. Copy the project's DSN (*Settings → Client Keys (DSN)*). Use one DSN for all environments (Sentry
   splits by `environment`) or one key per environment so a leaked staging key can be revoked alone.
4. Add `SENTRY_DSN=<dsn>` to the `ENV_FILE` secret of each GitHub environment (`staging`, `preprod`,
   `production`). Never commit it; the `*.env.example` files keep it empty.
5. Deploy, then check the startup log line shows `"errorReporting": true`.

### Alerting

Configure in Sentry *Alerts → Create alert*, scoped to project `truckbeez-api`:

| Alert | Condition | Environments | Notify |
|---|---|---|---|
| New issue | A new issue is created | `prod`, `preprod` | Slack `#truckbeez-alerts` + email to on-call |
| Regression | A resolved issue reappears | `prod` | Slack + email |
| Spike | Issue seen > 50 times in 5 min | `prod` | Slack + email (high priority) |
| New issue (staging) | A new issue is created | `staging` | Slack `#truckbeez-dev` only |

Install the Sentry Slack integration (*Settings → Integrations → Slack*) to use Slack actions.
Errors alert on *new kinds* of failure; availability and latency still page on **SLO burn rate**
(route API p95 < 800 ms, 99.9 % availability), not on individual errors.

### Turning a crash into a Jira bug

1. Open the issue in Sentry and check `release` (git SHA), `environment`, the route tag and the
   stack trace. Confirm the event contains no location or personal data; if it does, delete the
   event and treat it as a scrubber bug (Highest priority, `truckbeez-security-engineer`).
2. Create the bug: install the Jira integration (*Settings → Integrations → Jira*), then on the issue
   use *Link Issue → Jira → Create*, or create it by hand in Jira with:
   - summary `[Sentry] <exception type>: <short message>` in the right project, label `sentry`;
   - the Sentry issue URL, first/last seen, event count, `release` and `environment`;
   - steps to reproduce if known, and expected vs actual behaviour.
   Never paste raw request data, coordinates or customer names from elsewhere into the bug.
3. Assign it to `truckbeez-fullstack-engineer`. The fix PR references the Jira key and adds a
   regression test; mark the Sentry issue *Resolved in next release* so a regression alerts again.
4. A user who quotes a `reference` from an error response: search Sentry for that event id.

### Mobile app (follow-up, BR-53)

Not in this PR. Once the mobile layout is consolidated (BR-53):

- **SDK:** `@sentry/react-native` (the `sentry-expo` package is deprecated in favour of it) with its
  Expo config plugin in `app.config.ts`; a separate Sentry project `truckbeez-mobile`.
- **Config:** DSN from EAS environment variables / EAS secrets per build profile, never in the
  repo; `environment` = EAS build profile, `release` = app version + build number, `dist` = build number.
- **Source maps:** uploaded during EAS Build by the config plugin with `SENTRY_AUTH_TOKEN` stored as
  an EAS secret; OTA updates (`eas update`) upload their bundles' source maps too, so JS-only releases
  stay symbolicated. iOS dSYMs and Android ProGuard/R8 mappings upload in the same build step.
- **Privacy:** the same rules as the API: no user IP, no location (`beforeSend` and
  `beforeBreadcrumb` drop navigation/geolocation breadcrumbs and coordinate data), no screenshots
  or view hierarchy (they could show the map), session replay off.
- **Gates:** crash-free sessions ≥ 99.5 % gates the staged store rollout (1 % → 10 % → 50 % → 100 %);
  release health is read from the Sentry release for that build.

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
