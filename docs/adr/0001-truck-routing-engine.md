# ADR-0001: Truck routing engine

| | |
|---|---|
| **Status** | Proposed: needs owner sign-off |
| **Date** | 2026-11-04 |
| **Jira** | BR-51 |
| **Deciders** | Dayo Sodimu (owner) |
| **Agents consulted** | data-engineer-analyst, security-engineer, qa-automation-engineer |

## Context

TruckBeez must never send a truck down a road it is not allowed on (CLAUDE.md non-negotiable #2), and it serves hazmat carriers from Phase 1. The routing engine supplies the restriction data (bridge heights, weight limits, hazmat-prohibited roads, tunnel categories), so it is the decision that most affects driver safety.

The choice has partly been made already. Both starter PRs call **HERE Routing API v8** in `transportMode=truck`:

| PR | File | Status of the HERE integration |
|---|---|---|
| #2 (BR-1) | `apps/api/src/routing/hereProvider.ts` | Rounds dimensions up, maps hazmat classes conservatively, sends the tunnel category, **discards routes with critical notices** and returns `no_safe_route` (UC-04), unit-tested |
| #3 (BR-38) | `apps/server/src/lib/routing.ts` | **Returns HERE's first route without checking notices**, sends hazmat as free-text HERE categories, no tunnel category, no tests |

This ADR records why HERE stays, what was compared, and what still has to be fixed before launch.

## Options considered

| Option | Hazmat inputs | Restriction data | In-app navigation SDK | Cost to start | Fit for Phase 1 |
|---|---|---|---|---|---|
| **HERE Routing v8** (in use) | `shippedHazardousGoods` categories (explosive, flammable, gas, poison, radioactive, corrosive, harmfulToWater, …) + ADR tunnel category B–E | Commercial truck attributes worldwide | Navigate SDK: offline truck routing and turn-by-turn, **contract only; native iOS/Android and Flutter, no React Native** | Freemium monthly allowance, then pay per 1,000 transactions | ✅ Already integrated |
| **TomTom Routing API** | `vehicleLoadType` = **US hazmat classes 1–9** + ADR tunnel code | Commercial truck attributes | Navigation SDK for Android/iOS with vehicle profiles and offline maps, **by request only**, no React Native | 2,500 free non-tile requests/day; routing ≈ €0.75 per 1,000 | ✅ Strong runner-up |
| **Trimble PC\*Miler + HazMat** | General, explosive, flammable, inhalant, corrosive, radioactive, using **federal, state and local hazmat routing rules** | Industry reference for US hazmat compliance | CoPilot (separate product) | Enterprise licence, trial key on request | ⚠️ Best compliance, highest cost; use as the **reference to test against** |
| **Google Large Vehicle Routing** | Hazmat classes, but **no radioactive (class 7) routing** | US contiguous 48 only (GA Aug 2026) | Navigation SDK has an official **React Native** package (beta) | Access by request | ❌ Can return "best effort" routes through restricted segments; no class 7 |
| **Self-hosted Valhalla / GraphHopper / OSRM on OpenStreetMap** | Hazmat is a yes/no flag (Valhalla) or OSM tags | OSM hazmat and tunnel tags are sparse | None (build our own) | Free software, we run the servers | ❌ Not safe enough for hazmat; fine for dev fixtures |

## Decision

1. **Keep HERE Routing API v8 as the server-side truck routing engine**, behind the `RoutingProvider` interface from PR #2 (`apps/api/src/routing/`). No vendor SDK is called outside that folder.
2. **PR #2's provider is the reference implementation.** Every HERE call must:
   - send the full truck profile, with dimensions and weight **rounded up**;
   - send `shippedHazardousGoods` from the conservative UN class mapping (`hazmat.ts`), plus `tunnelCategory`;
   - **discard any route with a `critical` notice** and return `no_safe_route`. By default, HERE v8 still returns a route when no compliant one exists, flagged only by critical notices, and HERE's own docs recommend discarding such routes.
3. **TomTom is the documented fallback.** Its `vehicleLoadType` takes US hazmat classes 1–9 directly, so switching is a new `RoutingProvider`, not a redesign.
4. **Trimble PC\*Miler HazMat is the reference to test against.** The `@routing-safety` suite compares HERE routes for hazmat profiles against known prohibited segments and, where a trial key allows, against PC\*Miler HazMat routes.
5. **Google LVR and OSM engines are not used for Phase 1 routing.**

## Consequences

### Must fix before launch
| # | Item | Owner agent | Jira |
|---|---|---|---|
| 1 | **PR #3 safety gap:** `apps/server/src/lib/routing.ts` returns routes with critical notices. Replace it with PR #2's provider, or port the notice check, rounding, hazmat mapping and tunnel category, with tests. | fullstack-engineer, then qa-automation-engineer | BR-38 |
| 2 | **Choose one layout:** `main` has `services/api`, PR #2 has `apps/api`, PR #3 has `apps/server`. There should be one API and one routing module. | fullstack-engineer, devops-specialist | BR-1 / BR-38 |
| 3 | **Hazmat mapping review:** class 2.3 and 6.1 inhalation hazards need `poisonousInhalation`, so the truck profile must capture the division, not just the class. | security-engineer, fullstack-engineer | BR-1 |
| 4 | **Routing-safety matrix:** truck profiles × known low bridges, weight-limited bridges, hazmat-prohibited roads and tunnels. Any returned route that crosses one fails CI. | qa-automation-engineer | new |
| 5 | **Licensing check:** confirm HERE terms allow fleet tracking and route replay for B2B customers, and whether storing route polylines is allowed. | security-engineer | new |

### Open decision: ADR-0002, in-app turn-by-turn navigation
The driver app is **Expo / React Native**. Neither HERE's Navigate SDK nor TomTom's Navigation SDK ships for React Native, and both are contract or request-only. The options for voice navigation (UC-05, BR-32):
- **A.** Wrap the HERE Navigate SDK in an Expo native module (config plugin plus a development build; won't run in Expo Go).
- **B.** Build our own guidance on top of the route's `actions` from the API (simplest; no offline routing, rerouting needs the server).
- **C.** Switch the driver app to Flutter, which HERE supports officially, with a truck guidance example app.

Mixing engines (for example Google Navigation SDK with HERE routes) is not an option: each navigation SDK only guides its own engine's routes.

### Cost
HERE's free monthly allowance covers development and the pilot. Published figures for the allowance differ between sources (30k to 250k transactions), so confirm on the HERE pricing page before launch. Each reroute is a new transaction, so cache routes and reroute only when the driver leaves the route.

## Sources
- [HERE: Truck routing (Routing v8)](https://docs.here.com/routing/docs/routing-v8-truck-routing)
- [HERE: Notices](https://docs.here.com/routing/docs/notice) and [What is a notice](https://docs.here.com/routing/docs/routing-v8-notice)
- [HERE SDK: Licenses explained](https://docs.here.com/here-sdk/docs/introduction-editions) and [Feature list](https://docs.here.com/here-sdk/docs/introduction-feature-list)
- [HERE SDK examples (Android, iOS, Flutter)](https://github.com/heremaps/here-sdk-examples)
- [TomTom VehicleLoadType (US hazmat classes 1–9)](https://developer.tomtom.com/assets/downloads/mapssdk/APIReferences/JavaDocRouting_2.4.782/com.tomtom.online.sdk.routing.route.vehicle/-vehicle-load-type/index.html)
- [TomTom pricing](https://docs.tomtom.com/pricing) and [Navigation SDK for Android](https://developer.tomtom.com/navigation/android/introduction/introduction)
- [Trimble: PC\*MILER HazMat](https://transportation.trimble.com/node/1674)
- [Google: Navigate large vehicle routes](https://developers.google.com/maps/documentation/navigation/android-sdk/large-vehicle-navigation?hl=en) and [Google Navigation for React Native](https://github.com/googlemaps/react-native-navigation-sdk)
- [FreightWaves: Google Large Vehicle Routing GA](https://www.freightwaves.com/news/google-maps-just-launched-truck-aware-routing-that-knows-about-low-bridges-and-weight-limits-here-is-what-it-means-and-what-it-does-not)
- [GraphHopper: custom truck profiles (hazmat tags rare in OSM)](https://www.graphhopper.com/blog/2020/05/31/examples-for-customizable-routing/)
