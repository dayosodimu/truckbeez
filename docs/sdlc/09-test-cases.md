# 09 Test Cases

The baseline suite has 31 cases covering the core P1 requirements; each case ID is linked in the RTM (document 10) and mirrored in Jira (Xray/Zephyr). Automation column: Playwright (PW), Appium (AP), Postman/contract (API), k6, or Manual.

## Mobile — driver app

| ID | Title | Req | Preconditions | Steps | Expected result | Pri | Auto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-M-001 | Sign in with email OTP | FR-M-01 | Fresh install | Enter email → request code → enter valid OTP | Lands on permissions primer; tokens stored in secure storage | P1 | AP |
| TC-M-002 | Reject expired OTP | FR-M-01 | OTP older than 10 min | Enter expired code | Error "Code expired", resend offered | P2 | AP |
| TC-M-003 | Create truck profile | FR-M-02 | Signed in | Enter 13 ft 6 in, 80,000 lb, 5 axles → save | Profile saved; values shown in chosen units | P1 | AP |
| TC-M-004 | Truck profile validation | FR-M-02 | Signed in | Enter height 0 or > 15 ft | Inline error; save disabled | P2 | AP |
| TC-M-005 | Route avoids low bridge | FR-M-05, BR-01 | Profile 13 ft 6 in | Route across a known 12 ft bridge pair | No option uses the bridge; height in restrictionsApplied | P1 | API + AP |
| TC-M-006 | Hazmat route avoids restricted tunnel | FR-M-03, FR-M-05 | Hazmat class 3, tunnel cat. D | Route through a tunnel-restricted corridor | Route detours; hazmat chip shown on summary | P1 | API + AP |
| TC-M-007 | Up to 3 route options | FR-M-05 | Valid profile | Request route | 1–3 options with ETA, distance, tolls | P1 | AP |
| TC-M-008 | Turn-by-turn guidance | FR-M-06 | Route selected, GPX replay | Start navigation, replay track | Voice + banner for each manoeuvre at correct distance | P1 | AP |
| TC-M-009 | Reroute within 5 s | FR-M-07, NFR-01 | Navigating | Replay GPX leaving the route | New route shown ≤ 5 s after deviation | P1 | AP |
| TC-M-010 | Report hazard in 2 taps | FR-M-08, NFR-10 | Navigating at speed | Tap report → tap Accident | Report sent with current location; undo for 5 s | P1 | AP |
| TC-M-011 | Keyboard locked while moving | NFR-10 | Speed > 5 mph | Try to open search | Text input disabled; voice search offered | P1 | AP |
| TC-M-012 | Receive nearby hazard | FR-M-09 | Two devices, same route | Device B reports; observe device A | Device A shows hazard ≤ 3 s | P1 | AP |
| TC-M-013 | Accept fleet invite with consent | FR-M-11, BR-06 | Pending invite | Open invite → read consent → accept | Membership active; duty toggle visible | P1 | AP |
| TC-M-014 | No tracking off duty | BRULE-02 | In fleet, off duty | Drive 10 min (GPX) | No location:update emitted; dashboard shows offline | P1 | AP + API |
| TC-M-015 | Offline route continuation | FR-M-12 | Navigating | Enable airplane mode mid-route | Guidance continues; reports queued and sent on reconnect | P2 | Manual |
| TC-M-016 | Delete account | FR-M-15, NFR-08 | Signed in | Settings → Delete account → confirm | Signed out; API returns 401 for old token; purge job scheduled | P1 | AP + API |
| TC-M-017 | Background location permission denied | NFR-08 | Fresh install | Deny "Always" permission | App explains impact; navigation still works in foreground | P2 | Manual |
| TC-M-018 | Battery budget | NFR-03 | Full charge, reference devices | Navigate 60 min, screen on | Drain ≤ 7% | P1 | Manual |

## Web — fleet dashboard and admin

| ID | Title | Req | Preconditions | Steps | Expected result | Pri | Auto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-W-001 | Fleet sign-up | FR-W-01 | None | Sign up, create company | Dashboard opens with empty live map | P1 | PW |
| TC-W-002 | Buy Starter plan | FR-W-02 | Stripe test mode | Choose Starter, 5 seats, pay with test card | Subscription active; invoice listed | P1 | PW |
| TC-W-003 | Invite drivers | FR-W-01 | Active plan | Invite 3 by email | Invites pending; seat count updated | P1 | PW |
| TC-W-004 | Live map updates | FR-W-03 | Driver on duty (simulated) | Watch map while driver moves | Marker moves; refresh ≤ 5 s | P1 | PW + API |
| TC-W-005 | Export trip report | FR-W-04 | Trips exist | Reports → date range → CSV | File downloads with expected columns and rows | P1 | PW |
| TC-W-006 | Dispatcher cannot change billing | FR-W-07 | Dispatcher role | Open Plans + billing | Access denied message; API 403 | P1 | PW + API |
| TC-W-007 | Unpaid account auto-pause | FR-W-09, BRULE-04 | Failed payment webhook | Advance clock 14 days | Tracking paused; drivers keep free navigation | P1 | API |
| TC-W-008 | Admin removes abusive report | FR-W-08 | Admin role | Moderation → remove hazard | Hazard disappears for drivers; audit row written | P1 | PW |
| TC-W-009 | Keyboard-only navigation | NFR-09 | Any page | Tab through live map and reports | All controls reachable; focus visible; axe 0 serious | P2 | PW |

## API and non-functional

| ID | Title | Req | Steps | Expected result | Pri | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| TC-A-001 | Contract conformance | All REST | Run contract tests against staging | 0 schema mismatches | P1 | API |
| TC-A-002 | Auth required | NFR-07 | Call protected endpoints without token | 401 on every endpoint | P1 | API |
| TC-A-003 | Hazard expiry | FR-A-03 | Create hazard, no votes, advance 60 min | Status expired; hazard:expired emitted | P1 | API |
| TC-P-001 | Load: 20k concurrent drivers | NFR-06, NFR-01 | k6: 20k sockets sending every 5 s + 300 route calls/min for 30 min | Error rate < 0.5%; REST p95 ≤ 300 ms; route p95 ≤ 3 s | P1 | k6 |

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
