# TruckBeez SDLC documentation

Twelve documents cover the full lifecycle of the TruckBeez driver app (Expo), fleet dashboard (Next.js) and API (`services/api`). Every requirement has an ID, and screens, endpoints, tables and test cases point back to it, so the traceability matrix (10) can be built from the documents and from the code.

| # | Document | Owner | Department skill |
| --- | --- | --- | --- |
| 00 | [Overview](00-overview.md) | Product | — |
| 01 | [01 Project Charter](01-project-charter.md) | Product / Kitchnow LLC | `sdlc-product-owner` |
| 02 | [02 Business Requirements Document (BRD)](02-business-requirements.md) | Product | `sdlc-product-owner` |
| 03 | [03 Software Requirements Specification (SRS)](03-software-requirements.md) | Product + Eng lead | `sdlc-product-owner` |
| 04 | [04 System Architecture Document](04-system-architecture.md) | Eng lead | `sdlc-solution-architect` |
| 05 | [05 UI/UX Design Specification](05-ui-ux-design-spec.md) | Design | `sdlc-design-lead` |
| 06 | [06 API Specification](06-api-specification.md) | Backend | `sdlc-backend-engineer` |
| 07 | [07 Database Design](07-database-design.md) | Backend | `sdlc-backend-engineer` |
| 08 | [08 Test Strategy and Test Plan](08-test-strategy-and-plan.md) | QA lead | `sdlc-qa-lead` |
| 09 | [09 Test Cases](09-test-cases.md) | QA | `sdlc-qa-lead` |
| 10 | [10 Requirements Traceability Matrix (RTM)](10-traceability-matrix.md) | QA lead | `sdlc-qa-lead` |
| 11 | [11 Deployment and Release Plan](11-deployment-and-release.md) | DevOps | `sdlc-devops-sre` |
| 12 | [12 Operations and Maintenance Plan](12-operations-and-maintenance.md) | DevOps + Support | `sdlc-devops-sre` |

All documents are **Draft v0.1**. Items marked **[Assumption]** are defaults chosen to complete the set; confirm or replace them before baselining. The routing provider (HERE vs Trimble PC*MILER, ADR-004) is still open.

## Exports

- [`exports/TruckBeez_SDLC_Documentation.docx`](exports/TruckBeez_SDLC_Documentation.docx) — all documents in one Word file
- [`exports/TruckBeez_SDLC_Overview.pptx`](exports/TruckBeez_SDLC_Overview.pptx) — 17-slide summary deck

The Markdown files are the source of truth; regenerate the exports after a change.

## Department skills

Skills in `.claude/skills/` write and maintain these documents and turn them into code. They share one ID scheme and end every change with a **Handoffs** list for the other departments.

| Skill | Writes | Code it produces |
| --- | --- | --- |
| `sdlc-product-owner` | 01, 02, 03 | Gherkin `.feature` files, `requirements.csv` |
| `sdlc-solution-architect` | 04, ADRs | `docs/adr/`, Mermaid diagrams, interface stubs |
| `sdlc-design-lead` | 05 | Design tokens, theme file, screen-state map |
| `sdlc-backend-engineer` | 06, 07 | OpenAPI 3.1, Zod schemas, migrations |
| `sdlc-qa-lead` | 08, 09, 10 | Playwright, Appium, API and k6 suites |
| `sdlc-devops-sre` | 11, 12 | Dockerfiles, `deploy/` Compose files, GitHub Actions, runbooks |
| `ultra-code` | — | A full feature slice (contract → migration → API → realtime → screen → tests) built from the documents |

The skills complement the role agents in `.claude/agents/`: an agent decides *who* does the work, a skill describes *how* that department writes its document or code.
