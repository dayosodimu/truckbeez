# Orchestra standards

Edit this file to match your project. Agents treat it as binding; changes to the stack need an ADR.

## Default stack
| Layer | Default | Alternatives |
|---|---|---|
| Web | Next.js (App Router) + TypeScript | Remix, Vite + React |
| Mobile | Expo + React Native + TypeScript | Flutter, native Swift/Kotlin |
| API | Node.js + TypeScript (Fastify or NestJS) | Python FastAPI, Go |
| Database | PostgreSQL + migrations | — |
| Contract | OpenAPI 3.1 in `docs/03-architecture/openapi.yaml`; clients generated from it | — |
| Monorepo | pnpm workspaces: `apps/api`, `apps/web`, `apps/mobile`, `packages/api-client`, `packages/tokens` | — |

## Commands (update to match your repo)
| Check | Command |
|---|---|
| Lint | `pnpm lint` |
| Type-check | `pnpm typecheck` |
| Unit + contract tests | `pnpm test` |
| Web e2e | `pnpm exec playwright test tests/e2e-web` |
| Mobile e2e | `maestro test tests/e2e-mobile` |
| Gate check | `python3 scripts/gate-check.py <gate> [slice]` |

## Code
- TypeScript strict mode. No `any` without a comment explaining why.
- All UI values come from design tokens. No hard-coded colors, sizes or spacing.
- Errors from the API use `{ code, message, details }`. Clients show a human message and log the code.
- No secrets in the repo or the mobile bundle. Config via environment variables, documented in `.env.example`.
- Feature flags for every new user-facing mobile feature.

## Testing
- Acceptance tests are written before implementation and named by criterion: `US-03 AC-2: ...`.
- Locators: role/label first, `data-testid` / `testID` second; never CSS chains or XPath.
- No fixed sleeps. Each test creates and cleans up its own data.
- Web e2e runs on Chromium, Firefox and WebKit. Mobile e2e runs on one iOS and one Android target.

## Accessibility (WCAG 2.2 AA)
- Web: axe-core in Playwright on every route; zero serious or critical violations at G5.
- Keyboard path for every action, visible focus, text contrast 4.5:1.
- Mobile: labels and roles on every control, 44 pt targets, dynamic type, reduced motion respected.

## Performance budgets
- Web: LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on a mid-tier mobile profile.
- Mobile: cold start < 2 s on a mid-range device; no dropped frames on primary lists.

## Security
- Web/API: OWASP ASVS Level 1. Mobile: OWASP MASVS.
- Critical and High findings block G5. Dependency audit has no unresolved critical advisories.

## Gates
| Gate | Exit criteria | Script checks | Checker agent | Approver |
|---|---|---|---|---|
| G1 Scope | PRD has problem, personas, scope, metrics; every story has Given/When/Then criteria and a priority | prd.md sections, criteria per story, no placeholders | product-strategist (self) | User |
| G2 Design | Every Must story maps to a flow and screen; tokens defined; contract valid and complete; ADRs for stack, auth, data | ux-spec, tokens.json valid JSON, openapi.yaml shape, ≥1 ADR, every story in ux-spec | code-reviewer | User |
| G3 Plan | Slices ≤ 2 days each, ordered; every story in a slice; every criterion mapped to a test | backlog + test plan cover every story | qa-engineer | Conductor |
| G4 Slice done | Slice tests green on targeted platforms; no contract drift; review has 0 blockers | tests exist for slice, review `Blockers: 0` | qa-engineer, code-reviewer | Conductor |
| G5 Release ready | Full regression green; 0 open P0/P1; a11y clean; security PASS; perf budget met | security verdict PASS, no open P0/P1 bugs | qa-engineer, security-reviewer | User |
| G6 Shipped | Live; release notes published; rollback tested; monitoring on | release notes exist, checklist fully ticked | release-manager | User |

The script checks structure only. Tests are run by CI and the qa-engineer; the substance is checked by the agents and approver above.
