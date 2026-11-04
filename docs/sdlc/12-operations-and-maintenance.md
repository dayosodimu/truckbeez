# 12 Operations and Maintenance Plan

TruckBeez targets 99.9% monthly API uptime with an on-call engineer paged for any Sev-1; because drivers depend on it at speed, a routing outage or an unsafe-route report is always treated as Sev-1.

## Service levels

| Measure | Target | Source |
| --- | --- | --- |
| API availability | 99.9% monthly (≤ 43 min downtime) | Load balancer + synthetic checks |
| Route calculation p95 | ≤ 3 s | APM traces |
| Live map freshness | ≤ 5 s | Gateway metrics |
| Crash-free sessions | ≥ 99.5% | Sentry (mobile + web) [Assumption] |
| Battery drain | ≤ 7%/h | RC battery tests + beta telemetry |
| Enterprise support response | Sev-1: 1 h, Sev-2: 4 h, Sev-3: 1 business day | Support desk |

## Monitoring and alerting

| Signal | Tool | Alert when |
| --- | --- | --- |
| Errors and crashes | Sentry | New Sev-1 issue or crash-free < 99.5% |
| Metrics and dashboards | CloudWatch + Grafana [Assumption] | CPU > 75% for 10 min; 5xx rate > 1% |
| Traces | OpenTelemetry → APM | Route p95 > 3 s for 15 min |
| Routing provider | Synthetic route every minute per region | 3 consecutive failures |
| Socket.IO | Connected sockets, emit lag | Drop > 30% in 5 min |
| Queues | BullMQ depth | Expiry or retention queue > 10 min behind |
| Uptime | External checker (e.g. Better Stack) | Any endpoint down 2 min |
| Cost | AWS Budgets + routing API usage | 80% of monthly budget |

## Incident management

| Severity | Example | Response | Updates |
| --- | --- | --- | --- |
| Sev-1 | API down; unsafe hazmat route reported; data breach | Page on-call now; incident lead within 15 min | Every 30 min to stakeholders; status page |
| Sev-2 | Live map stale; reroute failing for one platform | Within 1 h in business hours | Every 2 h |
| Sev-3 | Report export slow | Next business day | In Jira |

Every Sev-1 and Sev-2 gets a blameless postmortem within 5 business days: timeline, root cause, impact, and action items tracked in Jira.

## Runbooks

| Runbook | First steps |
| --- | --- |
| Routing provider outage | Confirm via synthetic checks → enable cached-route fallback flag → notify drivers in-app → contact provider support |
| Unsafe route report | Reproduce with the reported truck profile → add pair to the safety regression set → report data issue to provider → hotfix block if needed |
| Socket.IO connection storm | Scale gateway tasks → check Redis adapter health → enable client backoff flag |
| Database CPU high | Check slow-query log → kill runaway queries → scale RDS or move reads to replica |
| Bad mobile release | Halt staged rollout → republish previous EAS Update → raise min version if Sev-1 |
| Failed deploy | Switch blue/green back → open incident → fix forward |

## Maintenance

| Activity | Cadence | Owner |
| --- | --- | --- |
| Dependency and security patches (npm, Expo SDK, base images) | Monthly; critical CVEs within 72 h | Devs |
| Expo SDK upgrade | Each new SDK, within 3 months | Mobile lead |
| OS support review (iOS / Android minimums) | Yearly after new OS release | Product + QA |
| Backup restore test | Weekly in pre-production | DevOps |
| Routing safety regression set review | Quarterly, plus after every unsafe-route report | QA lead |
| Access review (AWS, GitHub, Stripe, HubSpot) | Quarterly | Eng lead |
| Cost review (cloud + routing licence) | Monthly | Kitchnow LLC |
| Doc review (this set) | Each release; full review quarterly | Doc owners |

## Support and feedback

- Drivers: in-app help and "Report a problem" (attaches logs and app version) → Jira Service Management queue [Assumption].
- Fleets: email support + Enterprise SLA above.
- Feedback and app-store reviews triaged weekly into the Jira backlog.

## Decommissioning

Retiring a feature or API version needs 90 days' notice to fleets, a minimum-app-version bump, data export for affected users, and deletion of retained data per document 07.

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
