# ADR-0003: One repository layout (one API, one mobile app)

| | |
|---|---|
| **Status** | Accepted (2026-11-12, owner sign-off on decisions 1–3) |
| **Date** | Proposed 2026-11-07, accepted 2026-11-12 |
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

## Owner decisions (accepted 2026-11-12)

| # | Decision | Owner's conditions |
|---|---|---|
| 1 | **Expo SDK 54 / React 19** for the one app. PR #3's app is upgraded from SDK 52 in step E before PR #2's pieces are merged in. | Compatibility of dependencies, navigation and native modules is verified **before** step E merges. See "Compatibility risks" below; each item is a merge gate for step E. |
| 2 | **Fleet screens stay in the mobile app** for owner-operators. `apps/fleet-web` is a separate, later deliverable with its own ADR and Jira epic. | The fleet API (step D) is designed for both clients, so the web dashboard needs no API rewrite. |
| 3 | **Classes 2 and 6 are routed as inhalation hazards** (`poisonousInhalation` sent for every class 2 and 6 load) until the truck profile captures the division. | The restriction is **communicated** to the driver on every affected route and refined when division-level data exists. See "Safety assumptions" below. |

## Compatibility risks (decision 1, SDK 52 → 54)

Each risk is checked in step E and recorded in that PR's description as verified, fixed or replaced. Step E does not merge with any item open.

| # | Risk | Why it matters | Check before merging step E |
|---|---|---|---|
| C1 | **New Architecture default.** SDK 53+ enables the React Native New Architecture by default; SDK 54 is the last SDK that lets it be turned off. | Native modules without New Architecture support crash or misbehave at runtime, not at build time. | Run `npx expo-doctor` and React Native Directory checks on every native dependency; build iOS and Android dev clients with the New Architecture on. Any library that fails is replaced, not pinned with the architecture off, because SDK 55 removes the opt-out. |
| C2 | **React 19 breaking changes** (removed `propTypes`/`defaultProps` on function components, string refs, legacy context; stricter ref handling). | PR #3 was written against React 18. | Typecheck with `@types/react` 19; search for `defaultProps`, string refs and `forwardRef` patterns; run the Jest suites from PR #2 and PR #3 together. |
| C3 | **Navigation library.** React Navigation and `react-native-screens` / `react-native-safe-area-context` must be on versions built for SDK 54 and React 19. | Navigation drives every screen including the Fleet stack (decision 2). | Install with `npx expo install` (never a hand-picked version); smoke-test every route, deep link and the Fleet tab on both platforms. |
| C4 | **Maps and location modules** (map view, `expo-location`, background location for on-duty tracking). | The core feature; background location behaves differently per OS and SDK. | Verify foreground and background location on a physical iOS and Android device; confirm permission prompts and the on-duty-only rule from the threat model (PR #20). |
| C5 | **Reanimated / gesture handler / worklets.** Reanimated 4 needs the New Architecture and a separate worklets package. | Map gestures and animated panels. | Match the versions `expo install` selects; run on device, not only the simulator. |
| C6 | **Jest and the test toolchain** (`jest-expo` preset matching SDK 54, React 19 test renderer). | PR #2's tests must stay green; `react-test-renderer` is deprecated with React 19. | Move component tests to React Native Testing Library where they use the test renderer. |
| C7 | **Appium selectors.** The upgrade and the merge can rename or drop `testID`s. | The QA plan (PR #21) drives E2E with Appium. | Keep a `testID` inventory and diff it in step E; QA signs off. |
| C8 | **Build tooling minimums** (Xcode, Android compile/target SDK, Node 22). | CI and store builds fail late otherwise. | Confirm the EAS/CI images meet SDK 54 minimums before step E. |

Version numbers above are what SDK 54 is documented to require at the time of writing; step E re-checks them against the Expo SDK 54 changelog rather than trusting this table.

## Safety assumptions (decision 3)

| # | Assumption | Effect | How it is communicated | How it is refined |
|---|---|---|---|---|
| S1 | A class 2 load may be division 2.3 (toxic gas, inhalation hazard). | `poisonousInhalation` is sent with `gas` and `flammable`. Some roads and tunnels are avoided that a 2.1 or 2.2 load could legally use. | `POST /api/route` returns `safetyAssumptions: [{ code: "HAZMAT_INHALATION_ASSUMED", hazmatClasses: [2], message }]` on success **and** inside the 422 `NO_SAFE_ROUTE` details. The app shows it with the route (design spec: PR #17 truck profile and no-safe-route screens). | When the profile captures division (e.g. `hazmatDivisions: ["2.1"]`), the mapping sends `poisonousInhalation` only for 2.3, and class 2 is removed from `INHALATION_ASSUMED_CLASSES` in the same PR. |
| S2 | A class 6 load may be division 6.1 with an inhalation hazard. | `poisonousInhalation` is sent with `poison` and `harmfulToWater`. | As S1, with `hazmatClasses: [6]`. | As S1, for 6.1 inhalation-hazard materials (Zone A–D) only; 6.2 infectious substances keep their own mapping. |
| S3 | Over-restricting is acceptable; under-restricting is not. | Longer routes or no route for some loads. | The message tells the driver why. A `NO_SAFE_ROUTE` caused only by the assumption must never be shown as a generic error. | Track how often the assumption is present on 422s (event plan, PR #19) to prioritise capturing divisions. |
| S4 | The driver's declared classes are correct. | The server cannot detect an undeclared load. | The profile editor (PR #17) asks for classes before the first route and on every edit. | Out of scope for routing; fleet compliance reports (step D) can flag mismatches later. |

Code: `services/api/src/routing/hazmat.ts` (`HERE_GOODS_BY_CLASS`, `INHALATION_ASSUMED_CLASSES`, `hazmatSafetyAssumptions`). A `@routing-safety` test keeps the two lists paired, so the driver is never told about a restriction the engine was not sent, and never sent one without being told.
