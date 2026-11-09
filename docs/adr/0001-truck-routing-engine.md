# ADR-0001: Truck routing engine

- **Status:** Accepted
- **Date:** 2026-11-09
- **Jira:** BR-51
- **Deciders:** Adedayo Sodimu (owner)
- **Code:** `apps/server/src/lib/routing.ts`, `apps/server/src/lib/hereRouting.ts`, `apps/server/src/routes/route.ts`

## Context

TruckBeez sends trucks, including hazmat loads, down real roads. A wrong route is a safety problem, not a slow one: a low bridge strike, an overweight bridge, or a hazmat load in a tunnel it may not enter. CLAUDE.md non-negotiable #2 says hazmat correctness beats route speed, and that the app must never return a route that breaks a hazmat or dimensional restriction.

The engine has to take, per request:

- height, width, length, gross weight and axle count;
- hazmat categories, from Phase 1;
- the ADR tunnel restriction code (B to E) for the load;

and it must say when it **cannot** find a legal route, so the server can refuse instead of guessing.

HERE Routing v8 was already wired in by the starter app (BR-38) and the earlier prototype (BR-1). This ADR checks that choice against the alternatives and records what it does not cover.

## Options considered

| Option | Truck inputs | Hazmat | Tunnel codes | Says when the route breaks a restriction | Coverage | Notes |
|---|---|---|---|---|---|---|
| **HERE Routing v8** (`transportMode=truck`) | height, width, length, gross weight, axle count, trailers | 11 categories (`vehicle[shippedHazardousGoods]`) incl. `poisonousInhalation`, `harmfulToWater` | Yes (`vehicle[tunnelCategory]`) | Yes: `critical` notices (`violatedVehicleRestriction`) | Global | Already integrated. REST, works from any server. |
| **TomTom Routing API** | height, width, length, weight, axle weight | US Hazmat classes 1 to 9 (`vehicleLoadType`), plus 3 generic classes outside the US | Yes (`vehicleAdrTunnelRestrictionCode`) | Not used as a pass/fail signal in our review | Global | Strong alternative. US class input would map directly to placards. |
| **Trimble PC\*Miler** (incl. HazMat module) | Full truck profile | US hazmat route types (general, explosive, inhalation, radioactive, flammable, corrosive) | N/A (North America) | Yes | North America | Industry reference for US/Canada hazmat routing. Enterprise licence, heavier integration. |
| **Google Large Vehicle Routing** (Routes API, `travelMode=TRUCK`) | height, width, length, weight, axle count, trailer | `hazardousGoodsTypes` | Not documented | Partly: `routeRestrictionsPartiallyIgnored` | Contiguous US (GA since Aug 2026); Japan experimental | Too new and US-only for Phase 1. Revisit for ETAs. |
| **Self-hosted OSM** (Valhalla, GraphHopper) | Varies by engine and profile | Limited (e.g. Valhalla: a single hazmat flag) | Limited | Engine-dependent | Depends on OSM data | No licence fees, but OSM truck restriction data (clearances, weight limits, hazmat routes) is incomplete. We would own the data quality, which we cannot verify today. |

## Decision

**Use HERE Routing API v8 in truck mode for all server-side routing.** It is the only option that is already integrated, covers every input above worldwide, and reports restriction violations in a form we can turn into a hard refusal.

The provider stays behind `apps/server/src/lib/routing.ts`, so it can be swapped or cross-checked later (see risk 4).

### Rules the integration must follow

These are enforced in code and covered by the `@routing-safety` tests in `apps/server/test/routing.test.ts`, which block the merge in `server-ci`:

1. **Discard any route with a non-`info` notice.** HERE v8 still returns a route when no legal one exists, and flags it with `critical` notices. HERE's docs say such routes need "thorough evaluation" before use. We never use them. Any notice whose severity is not exactly `info` (including unknown or missing severity) makes the route unusable, at section or top level. This includes time-dependent restrictions, since we do not send a departure time.
2. **No safe route means no route.** `POST /api/route` answers `422 NO_SAFE_ROUTE` with the reasons and **no geometry**. The mobile app clears any route it was showing.
3. **Round dimensions and weight up**, never down, so HERE never sees a smaller or lighter truck than the real one.
4. **Reject unknown hazmat values.** Input is validated against HERE's category list. A typo is a `400`, never silently dropped.
5. **Send the tunnel category** whenever the profile has one.
6. **The demo route is opt-in.** The straight-line demo route ignores every restriction. It is served only with `NODE_ENV=development|test` or `ALLOW_DEMO_ROUTE=true`. Any other environment without `HERE_API_KEY` refuses to start and refuses to route (BR-51-S1).
7. **Never pass HERE error bodies to clients.** They can echo the request URL, which contains the API key.

## Consequences

- Drivers get "no safe route" more often than with a permissive engine. That is intended. The UX for that state is owned by the UI/UX designer.
- We depend on HERE's restriction data being right. Unit tests prove we handle HERE's answer correctly. They do not prove HERE's answer is correct. The live matrix (risk 4) covers that.
- Every routing call goes through our server. The HERE key never ships in the mobile app.

## Open risks

### 1. In-app turn-by-turn navigation needs its own decision (ADR-0002)

The HERE SDK (Navigate edition) supports native iOS, Android and Flutter only. There is no React Native or Expo SDK, and Navigate features need a commercial contract. Today the app draws the server's polyline on `react-native-maps` and lists instructions. That is not voice-first guidance and does not reroute. Options for ADR-0002: native modules wrapping the HERE SDK, a different navigation SDK, or our own guidance on top of the server route.

### 2. Hazmat input: no UN class mapping, and the app cannot select every category

There is no UN hazard class to HERE category mapping in the code. Drivers pick HERE categories directly. `apps/mobile/src/screens/ProfileScreen.tsx` offers 6 of HERE's 11 categories: `flammable`, `explosive`, `gas`, `corrosive`, `poison`, `radioactive`. It is missing `poisonousInhalation`, `combustible`, `organic`, `harmfulToWater` and `other`.

So a driver carrying an inhalation hazard (for example Division 2.3, or 6.1 with a PIH/TIH marking) cannot tell the router, and may get a route that is legal for `poison` but not for inhalation hazards. Drivers think in placards and UN classes, not HERE categories.

**Action:** the owner reviews a UN class/division to HERE category mapping, especially inhalation hazards, oxidizers (5.x) and Class 9. The profile screen then asks for the placard class and maps it on the server.

### 3. US designated hazmat routes are not verified

US states and FMCSA designate preferred and restricted routes for hazmat (including NRHM routes for radioactive loads). We have not checked how completely HERE models them. Trimble PC\*Miler HazMat is the reference to compare against.

### 4. Live restriction matrix is empty

`apps/server/test/routing-safety.live.test.ts` runs real HERE requests against `apps/server/test/fixtures/live-restrictions.json` when `HERE_API_KEY` is set. The fixture has **no cases yet**, and the suite deliberately fails while it is empty and a key is present. Needed:

- verified cases (low clearances from state DOT lists, posted weight limits, hazmat-restricted tunnels and roads, US hazmat route designations), each with its source;
- the `HERE_API_KEY` repository secret, so CI runs them.

The same matrix can later be pointed at a second engine (PC\*Miler or TomTom) to cross-check HERE.

## References

- HERE Routing v8, notices: https://docs.here.com/routing/docs/routing-v8-notice
- HERE Routing v8, vehicle properties: https://docs.here.com/routing/docs/routing-v8-vehicle-properties
- HERE SDK platforms: https://www.here.com/platform/here-sdk
- TomTom Calculate Route: https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
- Google Large Vehicle Routing: https://developers.google.com/maps/documentation/routes/lvr
- ADR tunnel categories: UNECE ADR, section 1.9.5 and chapter 8.6
