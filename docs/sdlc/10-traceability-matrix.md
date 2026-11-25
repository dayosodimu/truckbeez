# 10 Requirements Traceability Matrix (RTM)

24 of 29 functional requirements have at least one test case; the 5 gaps below need cases before the M5 beta. Update this table whenever a requirement, design item or test case changes.

## Forward traceability

| Req | Business req | Design (screen / API / table) | Test cases | Coverage |
| --- | --- | --- | --- | --- |
| FR-M-01 | BR-04 | M-S01; /auth/*; users, auth_identities | TC-M-001, TC-M-002 | Covered |
| FR-M-02 | BR-01 | M-S03; /trucks; trucks | TC-M-003, TC-M-004 | Covered |
| FR-M-03 | BR-02 | M-S05; /routes; hazmat_profiles | TC-M-006 | Covered |
| FR-M-04 | BR-01 | M-S04; /places/search | TC-M-007 | Partial |
| FR-M-05 | BR-01, BR-02 | M-S05; /routes; routes | TC-M-005, TC-M-006, TC-M-007 | Covered |
| FR-M-06 | BR-01 | M-S06 | TC-M-008 | Covered |
| FR-M-07 | BR-01 | M-S06; /routes/{id}/reroute | TC-M-009 | Covered |
| FR-M-08 | BR-03 | M-S07; /hazards, hazard:report; hazards | TC-M-010 | Covered |
| FR-M-09 | BR-03 | M-S08; hazard:new; hazard_votes | TC-M-012 | Covered |
| FR-M-10 | BR-07 | M-S09; /places/search | — | Gap |
| FR-M-11 | BR-06 | M-S10; /invites, /me/duty; fleet_members, duty_sessions | TC-M-013, TC-M-014 | Covered |
| FR-M-12 | BR-09 | M-S06 offline cache | TC-M-015 | Covered |
| FR-M-13 | BR-05 | M-S11; /trips; trips | — | Gap |
| FR-M-14 | BR-03 | Push service | — | Gap |
| FR-M-15 | BR-11 | M-S12; DELETE /me | TC-M-016 | Covered |
| FR-W-01 | BR-05 | W-S01, W-S04; /fleets, /invites | TC-W-001, TC-W-003 | Covered |
| FR-W-02 | BR-05 | W-S02; /billing/checkout; subscriptions | TC-W-002 | Covered |
| FR-W-03 | BR-05 | W-S03; fleet:position | TC-W-004 | Covered |
| FR-W-04 | BR-05 | W-S05; /fleets/{id}/reports | TC-W-005 | Covered |
| FR-W-05 | BR-05, BR-02 | W-S06; fleet:alert; alerts | — | Gap |
| FR-W-06 | BR-05 | W-S06; /geofences; geofences | — | Gap (Could) |
| FR-W-07 | BR-05 | W-S04; RBAC middleware | TC-W-006 | Covered |
| FR-W-08 | BR-10 | W-S07; /admin/*; audit_log | TC-W-008 | Covered |
| FR-W-09 | BRULE-04 | /webhooks/stripe; subscriptions | TC-W-007 | Covered |
| FR-A-01 | BR-01 | Routing adapter | TC-M-005, TC-M-006 | Covered |
| FR-A-02 | BR-05 | Realtime gateway; location_points | TC-M-014, TC-W-004, TC-P-001 | Covered |
| FR-A-03 | BR-03 | Workers; hazards | TC-A-003 | Covered |
| FR-A-04 | BRULE-05 | Workers; retention jobs | TC-M-016 (partial) | Partial |
| FR-A-05 | BR-08 | Workers; HubSpot sync | TC-A-001 (schema only) | Partial |

## Non-functional traceability

| NFR | Test cases / method |
| --- | --- |
| NFR-01, NFR-06 | TC-M-009, TC-P-001 |
| NFR-03 | TC-M-018 |
| NFR-07 | TC-A-002, ZAP + MobSF scans |
| NFR-08 | TC-M-014, TC-M-016, TC-M-017 |
| NFR-09 | TC-W-009, manual VoiceOver/TalkBack pass |
| NFR-10 | TC-M-010, TC-M-011 |
| NFR-02, NFR-04, NFR-05, NFR-11–NFR-13 | Monitoring dashboards (document 12) + RC checks |

## Actions to close gaps

- [ ] Write TC for FR-M-10 (POIs along route)
- [ ] Write TC for FR-M-13 (trip history 30 days)
- [ ] Write TC for FR-M-14 (push notifications)
- [ ] Write TC for FR-W-05 (compliance alerts, Pro plan)
- [ ] Write TC for FR-W-06 (geofences) or defer with BR owner sign-off
- [ ] Add retention purge test for FR-A-04 and HubSpot event test for FR-A-05

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
