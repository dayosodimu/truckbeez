# 03 Software Requirements Specification (SRS)

The SRS turns each business requirement into testable functional (FR) and non-functional (NFR) requirements for the mobile app, web dashboard and API. Every ID here is traced in document 10.

## Product overview

- **Driver app (iOS 16+, Android 10+):** Expo SDK, background location, voice guidance, offline route continuation.
- **Fleet web dashboard:** latest Chrome, Edge, Safari and Firefox; responsive down to 1024 px; WCAG 2.1 AA.
- **Admin console:** part of the web app, role-gated.
- **API:** REST over HTTPS + Socket.IO for live location and hazards.

## Functional requirements — mobile (driver app)

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-M-01 | Sign up / log in with email + OTP, Apple and Google sign-in | BR-04 | Must |
| FR-M-02 | Create a truck profile: height, weight, length, width, axles, trailer type | BR-01 | Must |
| FR-M-03 | Set hazmat class(es) 1–9 and tunnel category per trip | BR-02 | Must |
| FR-M-04 | Search a destination by address, POI or coordinates | BR-01 | Must |
| FR-M-05 | Calculate up to 3 truck-legal route options with ETA, distance and tolls | BR-01, BR-02 | Must |
| FR-M-06 | Turn-by-turn voice and visual guidance with lane guidance | BR-01 | Must |
| FR-M-07 | Reroute within 5 s after leaving the route | BR-01 | Must |
| FR-M-08 | Report a hazard in ≤ 2 taps while driving (police, accident, closure, debris, weigh station open/closed) | BR-03 | Must |
| FR-M-09 | Show hazards on and near the route in real time; confirm or dismiss existing reports | BR-03 | Must |
| FR-M-10 | Find truck stops, parking, fuel and rest areas along the route | BR-07 | Should |
| FR-M-11 | Accept or decline a fleet invite; toggle on/off duty | BR-06 | Must |
| FR-M-12 | Continue the active route offline using cached tiles and route geometry | BR-09 | Should |
| FR-M-13 | Trip history for the last 30 days | BR-05 | Should |
| FR-M-14 | Push notifications: hazards ahead, fleet messages, app updates | BR-03 | Should |
| FR-M-15 | Delete account and personal data from inside the app | BR-11 | Must |

## Functional requirements — web (fleet dashboard and admin)

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-W-01 | Fleet owner sign-up, company profile, invite drivers by email/SMS | BR-05 | Must |
| FR-W-02 | Choose plan, pay by card, manage seats, invoices (Stripe) [Assumption] | BR-05 | Must |
| FR-W-03 | Live map of on-duty drivers, refreshed ≤ 5 s | BR-05 | Must |
| FR-W-04 | Trip and navigation reports by driver/date; export CSV and PDF | BR-05 | Must |
| FR-W-05 | Route compliance alerts (off-route, hazmat restriction breach) — Pro plan | BR-05, BR-02 | Should |
| FR-W-06 | Geofences with entry/exit alerts — Pro plan | BR-05 | Could |
| FR-W-07 | Roles: owner, dispatcher, viewer | BR-05 | Must |
| FR-W-08 | Admin: moderate hazard reports, suspend users, view audit log | BR-10 | Must |
| FR-W-09 | Grace period and auto-pause of tracking for unpaid accounts | BRULE-04 | Must |

## Functional requirements — API and platform

| ID | Requirement | Traces to | Priority |
| --- | --- | --- | --- |
| FR-A-01 | Proxy all routing calls to the chosen provider behind an internal routing interface | BR-01 | Must |
| FR-A-02 | Ingest driver location at 1 update per 5 s when on duty and fan out to fleet viewers | BR-05 | Must |
| FR-A-03 | Expire hazard reports per BRULE-03 | BR-03 | Must |
| FR-A-04 | Delete location history past plan retention | BRULE-05 | Must |
| FR-A-05 | Emit events for HubSpot / analytics (signup, trip started, plan purchased) | BR-08 | Should |

## Non-functional requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-01 | Performance | Route calculation p95 ≤ 3 s; REST p95 ≤ 300 ms (excluding routing) |
| NFR-02 | Performance | Mobile cold start ≤ 2.5 s on a mid-range Android (e.g. Pixel 6a) |
| NFR-03 | Battery | ≤ 7% battery per hour during active navigation, screen on |
| NFR-04 | Data use | ≤ 15 MB per hour of navigation, excluding map downloads [Assumption] |
| NFR-05 | Availability | API 99.9% monthly uptime |
| NFR-06 | Scalability | 20,000 concurrent navigating drivers at launch, 100,000 within 12 months |
| NFR-07 | Security | OWASP ASVS L2 (web/API), OWASP MASVS L1 (mobile); TLS 1.2+; secrets in a vault |
| NFR-08 | Privacy | CCPA/CPRA; consent before fleet tracking; data export and deletion within 30 days |
| NFR-09 | Accessibility | WCAG 2.1 AA on web; mobile supports VoiceOver/TalkBack, dynamic type, 44×44 pt touch targets |
| NFR-10 | Safety | Driving mode locks typing; reporting by large buttons or voice only |
| NFR-11 | Reliability | Crash-free sessions ≥ 99.5% |
| NFR-12 | Compatibility | iOS 16+, Android 10+; last 2 versions of major browsers |
| NFR-13 | Observability | Every request carries a trace ID; logs retained 30 days |

## Assumptions and open questions

- Open: final routing provider (HERE vs Trimble PC*MILER) — affects FR-A-01, FR-M-05, FR-M-12.
- Open: payment provider — Stripe assumed.
- Open: whether dispatchers can push routes to drivers in v1.

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
