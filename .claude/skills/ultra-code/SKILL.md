---
name: ultra-code
description: Turns SDLC docs (SRS, API spec, DB design, UI spec, test cases) into working, tested TruckBeez code — Express + Socket.IO API, Expo screens, Next.js web, Playwright/Appium tests — traced to requirement IDs. Use to build or implement any feature from the docs.
---

# Ultra Code: SDLC docs → working code

You turn the department documents into code a reviewer can merge. The documents are the contract: 03 SRS (FR/NFR), 05 UI/UX (screens and states), 06 API (endpoints, events, errors), 07 Database (tables, indexes, retention), 09 Test cases (TC IDs). Code that drifts from them silently is a defect, because QA's tests, the mobile app and the RTM all assume the contract is true.

Use this skill whenever the user asks to build, implement, code, scaffold or generate a feature, endpoint, screen, migration or test suite from the SDLC docs or requirement IDs, for TruckBeez or any web + mobile project using the same docs.

## Default stack (TruckBeez)

Decided: Expo (React Native) mobile, Node.js Express 5 + Socket.IO API in `services/api` (not NestJS; TypeScript ESM, Vitest), Docker for every environment, Playwright for web E2E, Appium for mobile E2E, GitHub repo `truckbeez`, Jira keys in branches/commits.
Assumed until the user confirms (keep marked **[Assumption]** in the README): Next.js web dashboard, PostgreSQL + PostGIS, Redis (Socket.IO adapter, BullMQ), Zod validation, Knex migrations, Vitest + Supertest for API tests (as in `services/api`), k6 for load. For another project, detect the stack from its repo instead.

Monorepo layout (create only the parts the task needs):

```
services/api/src/{modules/<feature>/{routes.ts,service.ts,repo.ts,schemas.ts,events.ts}, app.ts, server.ts}
services/api/migrations/            services/api/test/
apps/mobile/app/ (Expo Router)  apps/mobile/src/{screens,components,api}
apps/web/app/ (Next.js)         packages/shared/src/ (Zod schemas + types from 06)
tests/e2e-web/ (Playwright)     tests/e2e-mobile/ (Appium + WebdriverIO)   tests/load/ (k6)
deploy/ (Compose per environment)  .github/workflows/
```

## Workflow

1. **Pick a vertical slice.** One feature end to end (contract → table → API → realtime → screen → tests) beats a layer at a time, because it is testable and mergeable on its own. Name the slice by its FR IDs.
2. **Read the contract.** From the docs (attached, in a Claude Doc, in the repo's `docs/sdlc/`, or in the conversation) extract: FRs and NFRs, endpoints with fields/roles/errors, events with scoping, tables and indexes, screen states, TC IDs. If a needed piece is missing, choose the smallest reasonable contract, mark it **[Assumption]**, and list it as a handoff to that department's agent.
3. **Contract first.** Write Zod schemas in `packages/shared` matching 06 exactly (field names, types, required/optional, enums). API and clients both import them, so the contract has one source.
4. **Database.** One migration per change, expand → migrate → contract style; indexes from 07 with a comment naming the query each serves; CHECK constraints for business rules (cite BRULE).
5. **API.** Thin routes, logic in services, data access in repos. Every route: auth, role check, Zod validation, the documented error codes in the shared error envelope. Every Socket.IO handler: authenticated socket, room scoping (a fleet only receives its own drivers), payload validation. Keep business rules (expiry, thresholds, limits, safety gates) in **pure functions** with no framework imports so they are unit-testable anywhere.
6. **Clients.** Mobile screens implement every state from 05 (loading, empty, error, offline, permission denied, success), use `testID`/`accessibilityLabel` equal to the IDs QA's Appium tests use, and respect safety rules (no typing above 5 mph; hazmat routing never silently falls back to a non-hazmat route). Web uses `data-testid` for Playwright.
7. **Tests next to code.** Unit tests for pure logic; integration tests for routes (Vitest + Supertest); E2E specs from 09. Test titles start with the TC ID and end with the FR in brackets: `test('TC-A-003 hazard expires after 60 min unconfirmed [FR-A-03]', …)`. Code comments name the FR they implement: `// FR-M-08`.
8. **Verify, then claim.** Run what the environment allows, in this order: install, typecheck (`tsc --noEmit`), lint, unit tests, integration tests, `npx playwright test --list` for E2E specs. If packages can't be installed (offline or blocked registry), don't stop at unit tests: write minimal stand-ins for just the framework surface you use (a tiny router and request/response pair, a fake Socket.IO namespace that records `to(...).emit(...)` calls) under `test/support/`, run the route and socket tests against them with Node's built-in runner (`node --test`), and label those results "ran against stand-ins, not the real library". Still run `tsc` / `node --check` where possible, and state plainly what was not run (real Express/Socket.IO, the migration against PostGIS, E2E against a live app) and why. Never report "tests pass" for tests you did not run.
9. **Trace.** Produce the RTM delta: which FR/TC IDs now have code and tests (see the script below). Update or hand off the RTM row to QA.
10. **Deliver.** If the user's repo is connected and they asked for a PR: branch `<JIRA-KEY>-<slug>`, commits that reference the Jira key, PR description listing FR/TC IDs, what was run, and assumptions. Otherwise put the code in the working folder, zip it, and send it with a short README (how to run, what was verified, assumptions).

## Rules that protect the contract

- Changing an endpoint, field, event or table beyond what the docs say is a **contract change**: don't do it silently. Implement the documented version, and list the proposed change as a handoff to the Backend agent (06/07) and QA.
- Within `/v1`, changes are additive only; old app versions stay installed for months.
- Secrets come from environment variables; commit a `.env.example`, never real values.
- Location and personal data: respect the retention in 07 and never log raw coordinates with user IDs at info level.
- Battery budget (NFR, ≤ 7%/h): no polling loops on mobile; use the socket and push, adaptive location sampling.

## Traceability script

Save as `scripts/trace.py` in the repo when the user wants an RTM from code. It scans code and tests for requirement and test-case IDs.

```python
import re, sys, pathlib, collections
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
fr, tc = collections.defaultdict(set), collections.defaultdict(set)
for p in root.rglob("*"):
    if p.suffix not in {".ts", ".tsx", ".js", ".py", ".sql"} or "node_modules" in p.parts: continue
    text = p.read_text(errors="ignore"); is_test = re.search(r"(test|spec|e2e)", str(p), re.I)
    for f in set(re.findall(r"\b(?:FR-[MWA]|NFR)-\d+\b", text)):
        (tc if is_test else fr)[f].add(str(p.relative_to(root)))
print("| Req | Code | Tests | Coverage |\n| --- | --- | --- | --- |")
for r in sorted(set(fr) | set(tc)):
    cov = "Covered" if fr[r] and tc[r] else ("Code only" if fr[r] else "Test only")
    print(f"| {r} | {len(fr[r])} files | {len(tc[r])} files | {cov} |")
```

## Final reply

Short: the slice built (FR IDs), files created, what was run and its result, what could not be run, assumptions, and handoffs (Backend for contract gaps, QA for RTM rows and E2E runs, DevOps for new env vars or services, Design for states that needed a decision).
