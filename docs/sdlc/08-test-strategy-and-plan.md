# 08 Test Strategy and Test Plan

Quality is gated in CI: every pull request runs unit, API contract and web E2E smoke tests, and every release candidate runs the full Appium mobile suite, performance, accessibility, battery and hazmat-routing regression before sign-off. Safety-critical routing defects are always Sev-1.

## Scope

- **In:** driver app (iOS + Android), fleet dashboard, admin console, REST API, Socket.IO events, workers, routing adapter, billing webhooks, push notifications.
- **Out:** routing provider internals (we test our integration and a restriction regression set, not their map data), Stripe internals, app-store review.

## Test levels and tools

| Level | What | Tool | Owner | Runs |
| --- | --- | --- | --- | --- |
| Unit | Functions, hooks, services | Vitest (API, as in `services/api`), Jest + React Native Testing Library (mobile) | Devs | Every PR |
| Integration | API + PostgreSQL/Redis in containers | Vitest + Supertest + Testcontainers | Devs | Every PR |
| Contract | API vs OpenAPI file | Schemathesis or Dredd [Assumption] + Postman/Newman | QA | Every PR |
| Web E2E | Fleet dashboard + admin flows | Playwright (TypeScript), Chromium/WebKit/Firefox | QA | PR smoke, nightly full |
| Mobile E2E | Driver app flows on real devices | Appium 2 + WebdriverIO, device cloud (BrowserStack or Sauce Labs) | QA | Nightly + RC |
| Realtime | Socket.IO events, fan-out, reconnects | socket.io-client in Vitest + k6 websockets | QA | Nightly |
| Performance / load | 20k concurrent drivers, route p95 | k6 | QA + DevOps | Before each release |
| Accessibility | WCAG 2.1 AA | axe-core in Playwright; manual VoiceOver/TalkBack | QA | Nightly + RC |
| Security | OWASP Top 10, MASVS | OWASP ZAP, npm audit/Snyk, MobSF | QA + Eng | Weekly + RC |
| Battery / data | ≤ 7%/h, ≤ 15 MB/h | 60-min drive simulation, Xcode Energy Log, Android Battery Historian | QA | Each RC |
| Field (drive) testing | Real routes, real trucks | Beta drivers, TestFlight / Play internal track | Product + QA | Beta |
| Exploratory / UAT | Risk-based sessions | Charters in Jira / Xray | QA + stakeholders | Each RC |

## Routing safety regression set

A fixed set of at least 50 origin–destination pairs with known restrictions (low bridges, weight-limited bridges, hazmat-restricted tunnels such as category D/E, truck-prohibited parkways). Each run asserts the returned route avoids the restriction for the given truck profile and hazmat class. Any failure blocks release.

## Environments

| Env | Container stack | Data | Used for |
| --- | --- | --- | --- |
| Unit / CI | Docker Compose in GitHub Actions | Seeded synthetic | Unit, integration, contract |
| Staging | Docker on ECS, auto-deployed from main | Synthetic, routing sandbox keys | Web E2E, mobile nightly, exploratory |
| Pre-production | Docker, prod-like size | Anonymised copy, production routing keys | RC regression, load, battery, UAT |
| Production | Docker on ECS | Live | Smoke tests and monitoring only |

## Device and browser matrix

| Platform | Coverage |
| --- | --- |
| iOS | iPhone SE (3rd gen), iPhone 13, iPhone 15 Pro; iOS 16, 17, 18 |
| Android | Pixel 6a, Samsung Galaxy A14 (low-end), Galaxy S23, a rugged tablet (e.g. Samsung Tab Active); Android 10, 13, 14 |
| Web | Chrome, Edge, Firefox, Safari (latest 2); 1024, 1440, 1920 px widths |

## Entry and exit criteria

**Entry (test cycle starts):** build passes CI, deployed to the target environment, release notes and changed requirement IDs listed.

**Exit (release can ship):**

- [ ] 100% of P1 (Must) test cases executed; ≥ 98% passed
- [ ] 0 open Sev-1 and Sev-2 defects; Sev-3 have a fix plan
- [ ] Routing safety regression set 100% pass
- [ ] Performance: route p95 ≤ 3 s, REST p95 ≤ 300 ms at target load
- [ ] Battery ≤ 7%/h on the reference Android and iPhone
- [ ] No new critical/serious axe violations
- [ ] Crash-free sessions ≥ 99.5% in beta for 7 days (major releases)
- [ ] QA lead and product owner sign-off recorded in Jira

## Defect management

Defects are logged in Jira with steps, environment, build, device/OS, logs and video.

| Severity | Definition | Example | Fix target |
| --- | --- | --- | --- |
| Sev-1 Critical | Unsafe route, data loss, crash on launch, security breach | Hazmat route through a restricted tunnel | Hotfix within 24 h |
| Sev-2 Major | Core feature broken, no workaround | Reroute never triggers | Before release |
| Sev-3 Minor | Feature impaired, workaround exists | CSV export misses a column | Next sprint |
| Sev-4 Trivial | Cosmetic | Icon misaligned | Backlog |

## Automation framework

- Repos: `truckbeez/tests-web` (Playwright, Page Object Model), `truckbeez/tests-mobile` (Appium + WebdriverIO, screen objects), `truckbeez/tests-api` (Postman + Newman, contract tests) [Assumption: may live in the main truckbeez repo].
- Stable selectors: `data-testid` on web, `testID` / accessibility IDs on mobile, agreed with devs.
- GPS simulation: recorded GPX tracks replayed on emulators and devices for navigation tests.
- Reports: Allure reports published from GitHub Actions; results synced to Jira (Xray or Zephyr) [Assumption].

## Schedule and roles

| Activity | When | Owner |
| --- | --- | --- |
| Test plan approved | With M3 | QA lead |
| Automation framework ready | Sprint 2 of build | QA |
| Regression suite complete for P1 | Before M5 beta | QA |
| Beta field testing | M5 (4 weeks) | Product + QA |
| Release sign-off | Each release | QA lead + product |

## Risks

- GPS-dependent tests are flaky on emulators → replay GPX tracks and run critical checks on real devices.
- Routing sandbox data differs from production → run the safety regression set in pre-production with production keys.
- Background-location behaviour differs per OEM (battery optimisers) → include Samsung low-end device in the matrix.

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
