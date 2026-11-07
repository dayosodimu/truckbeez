# ADR-0003: One repository layout (one API, one mobile app)

| | |
|---|---|
| **Status** | Proposed: needs owner sign-off |
| **Date** | 2026-11-07 |
| **Jira** | BR-53 |
| **Deciders** | Dayo Sodimu (owner) |
| **Author** | fullstack-engineer |
| **Review requested** | devops-specialist (CI, Docker context), qa-automation-engineer (test suites), security-engineer (key handling, fleet auth) |
| **Related** | ADR-0001 (truck routing engine, PR #9), pre-launch item 2 "Choose one layout" |

## Context

The starter code arrived in three overlapping shapes. Each has something the others lack, and none can merge as-is without leaving two APIs or two apps in the repo.

| Where | API | Mobile app | Shared contracts | CI / deploy | Strong parts |
|---|---|---|---|---|---|
| `main` | `services/api` (Express 5 + Socket.IO scaffold, Vitest) | none | none | `ci-cd.yml`: unit tests in a Docker `test` stage, Trivy scan, image promoted staging → preprod → prod; `deploy/` compose envs | The only API with a container pipeline and deploys |
| PR #2 (BR-1) | `apps/api` (Express 5, `RoutingProvider`, HERE + demo providers, Vitest) | `apps/mobile` (Expo SDK 54, React 19): route planner, truck profile form, Jest tests | `packages/shared` (zod: truck profile, route request/response, error codes) | `ci.yml` (npm workspaces typecheck + test, no Docker) | Routing abstraction ADR-0001 adopts; metric contracts with hazmat classes 1–9 |
| PR #3 (BR-38) | `apps/server` (Express 4: route, reports, fleet module, Stripe billing, Socket.IO fleet rooms) | `apps/mobile` (Expo SDK 52, React 18): map, reports, profile, Fleet screens | none (types copied by hand between app and server) | none | Fleet product: orgs, invites, plans, live positions, trips |
| PR #10 (BR-51, onto #3) | fixes `apps/server` routing | small `MapScreen` change | none | `server-ci.yml` (node:test, `@routing-safety` step) | Strictest safety rules: unknown notice severity fails safe, top-level notices checked, parse errors become provider errors, 422 `NO_SAFE_ROUTE` |

Two APIs named `apps/api` and `apps/server`, two `apps/mobile` folders with different Expo SDKs, and three CI workflows mean any merge order creates conflicts and duplicated routing code. ADR-0001 requires exactly one routing module.

## Decision

Adopt this layout:

```
services/
  api/              The only API. Owns Dockerfile, deploy/, ci-cd.yml.
    src/routing/    The only routing module (RoutingProvider, HERE, demo). ADR-0001.
    src/fleet/      Fleet module (from PR #3), later PR.
    src/reports/    Community reports (from PR #3), later PR.
apps/
  mobile/           The only driver app (PR #3's app + PR #2's route planner pieces).
  fleet-web/        Next.js fleet dashboard (CLAUDE.md stack). Not part of this ADR's work; added when started.
packages/
  shared/           zod contracts validated on both ends (from PR #2).
tools/
  mcp-server/       Developer tooling (PR #8). Unaffected.
deploy/, docs/, .github/   As on main.
```

1. **`services/api` is the only API.** It already owns the Dockerfile, the compose environments and the image pipeline, and the SDLC documents (PR #12) and the MCP server (PR #8) already point at it. `apps/api` and `apps/server` are not created on `main`; their code is ported into `services/api` module by module.
2. **One routing module: `services/api/src/routing/`.** PR #2's `RoutingProvider` design (ADR-0001 decision 1) with PR #10's stricter rules applied on top:
   - any notice that is not explicitly `info` is critical, in a section **or at the top level**; a critical notice turns the route into `no_safe_route` (no geometry);
   - dimensions and weight rounded **up** with float-noise snapping (BR-47);
   - hazmat as UN classes 1–9 mapped conservatively to HERE categories, plus ADR tunnel category B–E; unknown values are rejected (400), never dropped;
   - unreadable HERE responses become provider errors (502), HERE error bodies are never read or logged (they can echo the key);
   - `POST /api/route` returns 422 `NO_SAFE_ROUTE` with reasons and no geometry;
   - the straight-line demo route is only available in `development` and `unit`; deployed environments refuse to start without `HERE_API_KEY`.
3. **`apps/mobile` is PR #3's app** (it has the map, reports and Fleet screens), with PR #2's `RoutePlannerScreen`, `TruckProfileForm`, `units.ts` (imperial display, metric wire format), API client and Jest tests merged in. The app imports types from `packages/shared` instead of hand-copied `types.ts`.
4. **`packages/shared` holds the API contracts** (PR #2's zod schemas). The wire format is PR #2's: metres and kilograms, `hazmatClasses: (1..9)[]`, optional `tunnelCategory`. PR #3's centimetre profile and free-text HERE hazmat strings are dropped; the app converts units for display only.
5. **npm workspaces at the root** (`services/*`, `apps/*`, `packages/*`) with one committed `package-lock.json` (BR-46). The API's Docker build context moves to the repo root so the image can include `packages/shared`.
6. **One CI entry point per concern.** `ci-cd.yml` stays the API pipeline and gains a named `@routing-safety` step. A `workspaces` job (typecheck + tests for `packages/shared` and `apps/mobile`) is added next to it. PR #2's `ci.yml` and PR #10's `server-ci.yml` are not merged.

### What moves where

| From | What | To | PR |
|---|---|---|---|
| PR #2 `apps/api/src/routing/*` | `RoutingProvider`, HERE provider, demo provider, hazmat mapping, flexible-polyline decoder | `services/api/src/routing/` | A |
| PR #10 `apps/server/src/lib/hereRouting.ts`, `routing.ts`, `routes/route.ts` | Fail-safe notice rules, top-level notices, parse errors → 502, deduped reasons, `@routing-safety` tests | merged into `services/api/src/routing/` (rules) and `services/api/test/` (tests, converted to Vitest) | A |
| PR #2 `apps/api/src/app.ts` | `POST /api/route`, error body `{ error: { code, message, details } }` | `services/api/src/routing/router.ts` | A |
| PR #2 `packages/shared/src/{truckProfile,route}.ts` | zod contracts | `services/api/src/contracts/` in PR A, then `packages/shared/` in PR B | A, B |
| PR #2 `package.json`, `tsconfig.base.json`, `.nvmrc` | workspaces root | repo root, workspaces extended with `services/*` | B |
| PR #2 `apps/api/src/realtime.ts`, PR #3 Socket.IO setup | Socket.IO with auth and `companyId` rooms | `services/api/src/realtime/` | C |
| PR #3 `apps/server/src/routes/reports.ts`, `lib/store.ts` | Community reports (in-memory for now) | `services/api/src/reports/` | C |
| PR #3 `apps/server/src/fleet/*` | Orgs, invites, plans, live positions, trips, Stripe Checkout + webhook | `services/api/src/fleet/` (Express 4 → 5, `companyId` from the token, cross-tenant test) | D |
| PR #3 `apps/mobile/*` | Driver app with Fleet screens | `apps/mobile/` | E |
| PR #2 `apps/mobile/src/{screens/RoutePlannerScreen,components/TruckProfileForm,units,api}.ts(x)`, `__tests__/*` | Route planner, profile form, units, tests | merged into `apps/mobile/` | E |

### What is dropped

| Dropped | Why |
|---|---|
| `apps/api` (PR #2) and `apps/server` (PR #3) as folders | Replaced by `services/api` |
| PR #3's `lib/routing.ts` before PR #10 | Returned HERE's first route without checking notices (ADR-0001) |
| `@here/flexpolyline` dependency (PR #3) | PR #2/#10's own decoder is tested and has no dependency |
| `dotenv` (PR #3), `tsx` as a production dependency (PR #2 `start` script) | Config comes from the environment injected by `deploy/`; the image runs compiled JS |
| PR #3's centimetre `TruckProfile` and free-text `hazmat: string[]` | One wire format (decision 4) |
| PR #3's dev-only `fleet:watch` that trusts a user id sent by the app | Rewritten with real auth in PR C/D (security) |
| `.github/workflows/ci.yml` (PR #2), `server-ci.yml` (PR #10) | Folded into `ci-cd.yml` + a workspaces job |
| PR #2's port 4000 default | `services/api` uses 3000, as in `deploy/` |

### PR sequence

Each step is one concern, targets `main`, and keeps `main` deployable.

| Step | Branch (proposed) | Content | Depends on | Review |
|---|---|---|---|---|
| 0 | `docs/BR-53-adr-0003-layout` | This ADR | none | owner |
| 1 | `chore/BR-52-secrets-hardening` (PR #11) | `Secret` config for `HERE_API_KEY`, secret scanning | none | security |
| A | `feat/BR-53-routing-into-services-api` | Routing module + `POST /api/route` + `@routing-safety` Vitest suite in `services/api`; contracts local to the API for now | 0 (and rebased onto 1 when it merges) | security (key handling), QA |
| B | `chore/BR-53-workspaces-shared` | Root npm workspaces, `packages/shared`, lockfile (BR-46), Docker context at repo root, `workspaces` CI job | A | devops |
| C | `feat/BR-53-reports-realtime` | Reports + Socket.IO with auth into `services/api` | B | security (location data) |
| D | `feat/BR-53-fleet-into-services-api` | Fleet module + Stripe webhook into `services/api`, cross-tenant test | B, C | security (auth, payments), QA |
| E | `feat/BR-53-one-mobile-app` | `apps/mobile` from PR #3 + PR #2's planner pieces on `packages/shared` | B (A for the route contract) | design, QA (Appium `testID`s) |
| F | none | Close PR #2, #3 and #10 as superseded, linking the PRs above | A–E merged | owner |

The live HERE `@routing-safety` matrix from PR #10 (`routing-safety.live.test.ts`) follows A as its own CI job with network access and the `HERE_API_KEY` repo secret; the unit container runs with `network_mode: none`.

## Consequences

- One API to deploy, one routing module to audit, one app to test; ADR-0001's "no vendor SDK outside `routing/`" becomes checkable.
- Existing PRs #2, #3 and #10 stop being merge candidates. Their review history stays useful as the source for steps A–E.
- Step B changes the Docker build context and adds a lockfile: devops must update `deploy/compose.unit.yaml` and `ci-cd.yml` in the same PR.
- Until step B, contracts live in `services/api/src/contracts/` and the app is not on `main`; nothing consumes them twice yet, so no drift.
- Deployed environments need `HERE_API_KEY` in `ENV_FILE` before step A merges, or the API refuses to start there.

## Open decisions for the owner

1. **Expo SDK for the one app:** PR #3 is on SDK 52 / React 18, PR #2 on SDK 54 / React 19. Proposal: SDK 54, upgraded in step E before merging PR #2's pieces.
2. **Fleet screens in the driver app vs. `apps/fleet-web`:** CLAUDE.md lists a Next.js dashboard; PR #3 built Fleet screens into the mobile app. Proposal: keep the mobile Fleet screens for owner-operators, start `apps/fleet-web` separately later.
3. **Hazmat class 2 and 6 inhalation hazards:** PR #2 noted that 2.3 / 6.1 should also send `poisonousInhalation`. Proposal (step A): send it for every class 2 and 6 load until the profile captures the division; over-restricting is safe, under-restricting is a P0.
