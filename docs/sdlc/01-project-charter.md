# 01 Project Charter

TruckBeez will ship a truck-safe, hazmat-aware navigation app on iOS and Android plus a fleet web dashboard, reaching public launch in May 2027 [Assumption: target dates below are proposals].

## Problem

Consumer navigation apps route trucks onto low bridges, weight-restricted roads and tunnels closed to hazmat loads. Owner-operators and small fleets lack an affordable app that combines truck-legal routing, live community hazard reports and fleet visibility.

## Objectives and success metrics

| Objective | Metric | Target (12 months after launch) |
| --- | --- | --- |
| Grow the driver base | App installs | 50,000 [Assumption] |
| Keep drivers navigating | Weekly active drivers / installs | ≥ 35% [Assumption] |
| Safe routing | Routes that violate a known truck restriction | 0 confirmed |
| Fleet revenue | Paying B2B fleet accounts | 150 [Assumption] |
| Battery efficiency | Battery drain during navigation | ≤ 7% per hour |
| Quality | Crash-free sessions | ≥ 99.5% |

## Scope

- **In:** driver app (routing, turn-by-turn, hazmat routing, hazard reporting, trip history), fleet web dashboard (live map, reports, driver management, billing), admin console, API, notifications.
- **Out (v1):** ELD integration, load boards, in-app payments to drivers, non-US markets, CarPlay/Android Auto (planned v1.1).

## Stakeholders

| Role | Name | Responsibility |
| --- | --- | --- |
| Sponsor / owner | Kitchnow LLC | Funding, final go/no-go |
| Product + QA lead | Dayo Sodimu | Requirements, test strategy, release sign-off |
| Engineering lead | TBD | Architecture, code quality |
| Mobile / web / backend devs | TBD | Build |
| Design | TBD | UX, design system |
| Marketing | TBD | HubSpot campaigns, SEO, ASO |

## Milestones

| # | Milestone | Exit criteria | Target |
| --- | --- | --- | --- |
| M1 | Charter + requirements baselined | Documents 01–03 approved | Nov 2026 |
| M2 | Routing provider chosen | HERE vs PC*MILER spike report signed off | Dec 2026 |
| M3 | Architecture + design baselined | Documents 04–07 approved | Dec 2026 |
| M4 | MVP feature complete | All P1 SRS requirements built | Mar 2027 |
| M5 | Closed beta (TestFlight / Play internal) | 100 drivers, 5 fleets, no open Sev-1 | Apr 2027 |
| M6 | Public launch v1.0 | Exit criteria in document 08 met | May 2027 |
| M7 | B2B subscription GA | Billing live, 10 paying fleets | Jun 2027 |

## Budget

Open question: monthly cloud, routing-API licence and headcount budget not yet set. Routing licence cost is the largest variable and is an output of M2.

## Key risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Routing licence cost too high per active driver | Medium | High | Spike compares HERE and PC*MILER pricing; cache routes; tiered plans |
| Incorrect restriction data causes an unsafe route | Low | Critical | Provider truck attributes + driver reports + hazmat test suite |
| Battery drain above 7%/h | Medium | High | Adaptive GPS sampling, battery tests on low-end Android |
| App-store rejection (background location) | Medium | Medium | Clear permission rationale, privacy labels, pre-review checklist |
| Low community report volume at launch | High | Medium | Seed with provider incidents; gamify reporting |

## Approval

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Sponsor | Kitchnow LLC |  |  |
| Product + QA lead | Dayo Sodimu |  |  |

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
