# TruckBeez — Shared Project Context

All TruckBeez agents in `.claude/agents/` read this file first. It is the single source of truth for product scope, conventions, and how the agents hand work to each other.

## Product
TruckBeez (project "Wave Bees" under Bees Route) is a **Waze-style navigation and routing app built for truck drivers**.

Core capabilities:
- **Truck-legal routing** – respects vehicle height, weight, length, axle count, and hazmat class; avoids low bridges, weight-restricted roads, and tunnels/roads closed to hazmat.
- **Hazmat carriers are served from Phase 1** – hazmat class (1–9), placard, and tunnel-category restrictions are first-class routing inputs, not add-ons.
- **Community reports (Waze-like)** – drivers report hazards, police, weigh stations (open/closed), closures, parking availability; reports are crowd-validated and expire.
- **Truck POIs** – truck stops, parking, fuel, scales, rest areas, repair.
- **B2B subscription (fleet)** – logistics business owners subscribe to track and report on their drivers' navigation: live location, trip history, route adherence, ETA, hazmat compliance reports.

## Proposed technical stack
As of November 2026 the repo has no application code yet, so this is the **proposed starting stack**. Agents scaffolding new code use it. Once code exists, agents follow what the repo actually uses, and this table is updated whenever a choice changes.

| Layer | Default |
|---|---|
| Mobile | React Native (Expo) + TypeScript (iOS & Android), offline-capable map tiles |
| Web (fleet dashboard) | React + TypeScript (Next.js) |
| API | Node.js + TypeScript (Express + Socket.IO), REST + WebSocket for live tracking — scaffold in `services/api` |
| Data | PostgreSQL + PostGIS, Redis (live positions, rate limits), object storage for trip traces |
| Routing | **HERE Routing API v8** (truck mode) behind the `RoutingProvider` interface; routes with `critical` notices are always discarded. TomTom is the fallback. See [ADR-0001](docs/adr/0001-truck-routing-engine.md) |
| Payments | Stripe Billing for B2B subscriptions (seat-based per driver) |
| Infra | Docker containers per environment (unit → staging → preprod → prod, see `docs/deployment.md`), Terraform, GitHub Actions CI/CD |
| Testing | Appium (mobile E2E – preferred), Playwright (web), Jest/Vitest (unit), k6 (load), axe (a11y) |

## Tooling & tracking
- **Code:** GitHub repo `truckbeez`
- **Planning:** Asana (Wave Bees project)
- **Dev & bugs:** Jira
- **Development guide:** whenever an agent changes the dev guide, the Google Drive copy must be refreshed too.

## Non-negotiables (all agents)
1. **Driver safety first.** No interaction that requires a driver to read or tap while the vehicle is moving beyond a single large glanceable action. Voice-first while driving.
2. **Hazmat correctness beats route speed.** Never return a route that violates a hazmat or dimensional restriction to save time. If data is uncertain, warn.
3. **Location data is sensitive.** Driver location is personal data. Fleet visibility is limited to on-duty time and to the subscribing company. Follow the security agent's data-handling rules.
4. **Everything is tested.** No feature is "done" without automated tests and a passing CI pipeline.
5. **Small, reviewable changes.** Conventional commits; one concern per PR; link the Jira key (e.g. `TB-123`) in branch names and commit messages.

## Agent roster and hand-offs
| Agent | Owns | Hands off to |
|---|---|---|
| `truckbeez-fullstack-engineer` | Mobile app, fleet dashboard, API, routing integration | QA (tests), Security (review), DevOps (deploy) |
| `truckbeez-ai-agent-architect` | AI/LLM features: voice copilot, report validation, ETA/risk models, agent workflows | Full-stack (integration), Data (features/eval data), Security (prompt-injection review) |
| `truckbeez-uiux-designer` | Driver UX, fleet dashboard UX, design system, accessibility | Full-stack (implementation), QA (a11y tests) |
| `truckbeez-qa-automation-engineer` | Test strategy, Appium/Playwright/API/load suites, quality gates | Full-stack (bugs via Jira), DevOps (CI gates) |
| `truckbeez-security-engineer` | Threat models, AppSec reviews, privacy, compliance, secrets | All agents (findings), DevOps (controls) |
| `truckbeez-data-engineer-analyst` | Pipelines, telemetry, geospatial data, fleet reports, KPIs | AI architect (datasets), Full-stack (report APIs) |
| `truckbeez-devops-specialist` | CI/CD, infra-as-code, environments, observability, releases | All agents (environments, pipelines) |

When a task crosses roles, the agent doing the work finishes its part, then states clearly which agent should pick up next and what it needs.
