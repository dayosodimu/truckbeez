# Overview

This set is the single source of truth for building, testing, shipping and running TruckBeez across its three clients: the Expo driver app (iOS + Android), the fleet web dashboard, and the Express + Socket.IO API. It covers every SDLC phase from initiation to maintenance.

- **In scope:** driver navigation and truck-safe routing, hazmat routing (phase 1), community hazard reports, the B2B fleet subscription, admin tools, CI/CD and the four Docker environments.
- **Out of scope for v1:** in-cab hardware (ELD devices), load boards, payments to drivers, and markets outside the US.
- **Audience:** engineering, QA, product, design, DevOps and Kitchnow LLC leadership.

Items marked **[Assumption]** are reasonable defaults chosen to complete the docs. Confirm or replace them before baselining.

## Document index

| # | Document | SDLC phase | Answers | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| 01 | Project Charter | Initiation | Why, who, budget, milestones, risks | Product / Kitchnow LLC | Draft |
| 02 | Business Requirements (BRD) | Requirements | What the business needs and how success is measured | Product | Draft |
| 03 | Software Requirements Spec (SRS) | Requirements | Functional and non-functional requirements, web + mobile | Product + Eng lead | Draft |
| 04 | System Architecture | Design | Components, tech stack, integrations, security | Eng lead | Draft |
| 05 | UI/UX Design Spec | Design | Screens, flows, design rules, accessibility | Design | Draft |
| 06 | API Specification | Design | REST endpoints, Socket.IO events, errors | Backend | Draft |
| 07 | Database Design | Design | Entities, schema, indexing, retention | Backend | Draft |
| 08 | Test Strategy and Test Plan | Testing | Scope, levels, tools, environments, exit criteria | QA lead | Draft |
| 09 | Test Cases | Testing | Executable cases for web, mobile and API | QA | Draft |
| 10 | Requirements Traceability Matrix | Testing | Requirement → design → test → defect links | QA lead | Draft |
| 11 | Deployment and Release Plan | Deployment | Environments, CI/CD, store release, rollback | DevOps | Draft |
| 12 | Operations and Maintenance | Maintenance | Monitoring, SLAs, incidents, runbooks | DevOps + Support | Draft |

## Product snapshot

TruckBeez is a Kitchnow LLC navigation app for truck drivers, built in the style of community-driven navigation apps like Waze, with truck-safe and hazmat-aware routing.

| Area | Decision | Basis |
| --- | --- | --- |
| Mobile app | Expo (React Native), iOS + Android | Decided |
| API | Node.js, Express + Socket.IO (not NestJS) | Decided |
| Routing engine | Spike: HERE vs Trimble PC*MILER | Open, spike in progress |
| Phase 1 audience | Owner-operators and hazmat carriers | Decided |
| B2B | Subscription for fleet owners to track and report driver navigation | Decided |
| Battery budget | ≤ 7% per hour during active navigation | Decided |
| Environments | Docker containers for unit, staging, pre-production, production | Decided |
| E2E testing | Appium for mobile E2E | Decided |
| Tracking | Asana (project), Jira (dev + bugs), GitHub repo `truckbeez` | Decided |
| Marketing | HubSpot email/CRM; goal = app installs | Decided |
| Web dashboard | React + Next.js, TypeScript | [Assumption] |
| Database | PostgreSQL 16 + PostGIS, Redis for cache and pub/sub | [Assumption] |
| Cloud | AWS (ECS Fargate, RDS, ElastiCache, S3, CloudFront) | [Assumption] |
| Auth | JWT access + refresh tokens; SSO later for fleets | [Assumption] |

## Document control

Every change to a Baselined document goes through a Jira ticket and is logged below; the Google Drive copy of the development guide is refreshed in the same change.

1. Raise a Jira ticket (type: Doc Change) linking the affected requirement IDs.
2. Edit the document, and update the RTM (document 10) if a requirement, design item or test changes.
3. Get approval from the document owner, then add a row to the change log.

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-04 | Dayo Sodimu | Initial draft of all 12 documents |

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
