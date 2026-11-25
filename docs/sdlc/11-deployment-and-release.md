# 11 Deployment and Release Plan

The same Docker image moves unchanged from CI through staging and pre-production to production; only configuration changes per environment. Backend and web ship continuously behind feature flags, while the mobile app ships on a two-week store train with OTA hotfixes for JavaScript-only changes.

## Environments

| Env | Purpose | Deploy trigger | Approval |
| --- | --- | --- | --- |
| Unit / CI | Build image, unit + integration + contract tests | Every PR | None (must pass) |
| Staging | Integrated testing, nightly E2E | Merge to main | None |
| Pre-production | Release candidate regression, load, UAT | Tag vX.Y.Z-rc.N | QA lead |
| Production | Live | Promote RC tag | QA lead + product owner |

## CI/CD pipeline (GitHub Actions)

1. Lint, type-check, unit and integration tests in the `test` stage of `services/api/Dockerfile` (`deploy/compose.unit.yaml`, see `docs/deployment.md`).
2. Build the runtime image, scan with Trivy, push to `ghcr.io/dayosodimu/truckbeez-api` and promote by digest.
3. Deploy to staging (ECS rolling update); run DB migrations as a one-off task first.
4. Run Postman smoke + Playwright smoke against staging; nightly full Playwright + Appium.
5. On RC tag: deploy the same image to pre-production; run full regression, routing safety set, k6 load.
6. Manual approval in GitHub Environments → blue/green deploy to production (CodeDeploy) → production smoke tests → shift 100% traffic.

## Branching and versioning

- Trunk-based: short-lived feature branches, PR review required, main always deployable.
- Semantic versioning; the API stays backwards compatible within /v1 so older app versions keep working.
- Jira ticket key in every branch and commit (e.g. `TB-142-reroute-timeout`).

## Mobile release (Expo / EAS)

| Step | Tool | Detail |
| --- | --- | --- |
| Build | EAS Build | production profile, auto-incremented build numbers |
| Internal test | TestFlight, Play internal track | QA + beta drivers |
| Store submit | EAS Submit | Screenshots, privacy labels, background-location justification video |
| Staged rollout | App Store phased release, Play staged rollout | 1% → 10% → 50% → 100% over 7 days if crash-free ≥ 99.5% |
| Hotfix | EAS Update (OTA) | JS-only fixes; native changes require a store build |
| Force update | Min-version check on launch | Blocks versions with Sev-1 safety bugs |

## Release checklist

- [ ] Exit criteria in document 08 met and signed off in Jira
- [ ] Release notes written (user-facing + internal)
- [ ] DB migrations are backwards compatible (expand → migrate → contract)
- [ ] Feature flags set for the rollout
- [ ] Monitoring dashboards and alerts checked (document 12)
- [ ] Rollback plan confirmed and on-call engineer named
- [ ] Marketing/HubSpot notified for user-facing releases
- [ ] Google Drive copy of the development guide refreshed if the process changed

## Rollback

| Component | How | Time to restore |
| --- | --- | --- |
| API / realtime / workers | Blue/green: switch traffic back to the previous task set | < 5 min |
| Web dashboard | Redeploy previous image tag | < 10 min |
| Database | Forward-fix migration; point-in-time restore only for data loss | 30–60 min |
| Mobile JS | Republish previous EAS Update | < 15 min |
| Mobile native | Halt staged rollout; ship fix build; raise min version | Hours to days |

## Release notes template

```
## TruckBeez vX.Y.Z — YYYY-MM-DD
### New
- ...
### Improved
- ...
### Fixed
- TB-123: ...
### Known issues
- ...
```

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
