# 02 Business Requirements Document (BRD)

TruckBeez makes money from fleet subscriptions while keeping the driver app free, so the business needs both mass driver adoption and a fleet product worth paying for.

## Business goals

- Become the default free navigation app for US owner-operators and hazmat carriers.
- Convert fleet owners to a paid subscription that tracks and reports driver navigation.
- Grow installs through SEO (drivers first, then fleet owners) and HubSpot email campaigns.

## Personas

| Persona | Who | Primary need | Platform |
| --- | --- | --- | --- |
| Owner-operator | Self-employed driver, 1 truck | Truck-legal routes, hazard alerts, low data and battery use | Mobile |
| Hazmat driver | Carries placarded loads (classes 1–9) | Routes that avoid tunnels and roads restricted for their hazmat class | Mobile |
| Fleet driver | Employee of a 5–500 truck fleet | Same as owner-operator; dispatched routes | Mobile |
| Fleet owner / dispatcher | Runs a logistics business | Live driver locations, route compliance, ETA, reports | Web |
| TruckBeez admin | Kitchnow LLC staff | Moderate reports, manage accounts, support | Web |

## Business requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| BR-01 | Drivers get turn-by-turn routes that respect truck height, weight, length, width and axle limits | Must |
| BR-02 | Hazmat drivers get routes that respect hazmat restrictions for their load class (phase 1) | Must |
| BR-03 | Drivers can report and see live road hazards (police, accident, closure, weigh station status) | Must |
| BR-04 | The driver app is free; core navigation never sits behind a paywall | Must |
| BR-05 | Fleet owners subscribe monthly or annually to track drivers and export navigation reports | Must |
| BR-06 | Drivers in a fleet consent before their location is shared, and sharing stops off-duty | Must |
| BR-07 | Find truck stops, parking, fuel and rest areas along the route | Should |
| BR-08 | Marketing can attribute installs to campaigns (HubSpot, UTM, store attribution) | Should |
| BR-09 | Works with poor coverage: offline route continuation and cached maps for the active route | Should |
| BR-10 | Admins can moderate reports and suspend abusive accounts | Must |
| BR-11 | Comply with US privacy law (CCPA/CPRA) and store data-safety rules | Must |
| BR-12 | CarPlay and Android Auto | Could (v1.1) |

## Subscription model [Assumption]

| Plan | Price | Includes |
| --- | --- | --- |
| Driver | Free | Navigation, hazmat routing, hazard reports |
| Fleet Starter | $15 per driver / month | Live map, trip history 90 days, CSV reports, up to 25 drivers |
| Fleet Pro | $25 per driver / month | Everything in Starter + route compliance alerts, geofences, API access, 1-year history |
| Enterprise | Custom | SSO, SLA, dedicated support, unlimited history |

## Business rules

- BRULE-01: A driver belongs to at most one fleet at a time.
- BRULE-02: Fleet tracking only runs while the driver is on duty and has accepted the fleet invite.
- BRULE-03: A hazard report expires after 60 minutes unless other drivers confirm it [Assumption].
- BRULE-04: Unpaid fleet accounts get a 14-day grace period, then tracking pauses; drivers keep free navigation.
- BRULE-05: Location history older than the plan's retention period is deleted.

## Constraints

- Mobile: Expo / React Native; API: Express + Socket.IO; deployment: Docker containers.
- Routing provider (HERE or Trimble PC*MILER) licence terms may limit caching and offline use.
- Battery budget ≤ 7% per hour during navigation.

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
