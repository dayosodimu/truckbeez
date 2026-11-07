# TruckBeez QA test plan: iOS and Android (BR-13)

| | |
|---|---|
| Jira | BR-13 (epic BR-2 TruckBeez Bug Tracking & Quality) |
| Owner | QA automation (`truckbeez-qa-automation-engineer`) |
| Status | Draft for owner review |
| Applies to | Driver app (`apps/mobile`, Expo React Native), the API it calls, and the in-app TruckBeez Fleet screens |
| Related | Bug template and triage: [`bug-triage.md`](bug-triage.md) (BR-11) · Use cases BR-28 to BR-37 · ADR-0001 routing engine · `@routing-safety` API suite (BR-51/BR-12) · Environments: [`../deployment.md`](../deployment.md) |

## 1. Purpose and scope

Prove, before every release, that TruckBeez sends trucks only on roads they may legally and safely use, that drivers never have to read or type while moving, and that it keeps working on real phones in real driving conditions: poor GPS, no signal, a locked screen, a ten-hour shift on battery.

**In scope**

- Driver app on iOS and Android: truck profile, route planning, navigation and rerouting, community reports, truck POIs, duty sharing, joining a fleet.
- Fleet screens in the app (dashboard, driver detail, plans) and the fleet API behind them.
- The API as the app sees it: `/api/route`, `/api/reports`, fleet endpoints, Socket.IO live updates.
- Non-functional: battery, background location, offline behaviour, accessibility, performance on low-end Android.

**Out of scope for this plan** (covered elsewhere)

- Routing-engine internals and the full restriction matrix: the `@routing-safety` API suite (BR-12, PR #10). This plan relies on it and adds the app-level checks on top.
- Web fleet dashboard (Next.js) E2E: a Playwright plan comes once that app exists.
- Penetration testing and threat models: `truckbeez-security-engineer`.
- Load testing of live tracking: separate k6 plan.

## 2. Quality risks and priorities

Testing effort follows risk. P0 failures are Critical bugs and block release (see [`bug-triage.md`](bug-triage.md)).

| # | Risk | Impact | Priority | Main layer |
|---|---|---|---|---|
| R1 | A route sends a truck under a low bridge, over a weight limit, onto a truck-banned road or through a tunnel closed to its hazmat class | Crash, death, hazmat spill, legal liability | **P0** | API `@routing-safety` + app E2E that the profile the app sends is the profile the driver saved |
| R2 | The app sends the wrong truck profile (stale, default, unit error cm vs m, kg vs t, hazmat dropped) | Same as R1 | **P0** | Unit (profile serialisation) + API contract + E2E |
| R3 | Reroute after leaving the route ignores the truck profile, or falls back to a car route when no truck route exists | Same as R1 | **P0** | API + E2E with GPX off-route track |
| R4 | Restriction data is missing or uncertain and the driver gets no warning | Driver trusts a route that may be unsafe | **P0** | API + E2E |
| R5 | Driver must read or tap small targets while moving | Distraction crash | **P0** | E2E with simulated speed + a11y audit |
| R6 | Driver location is visible to a fleet while off duty, or to another company | Privacy breach, legal exposure, loss of driver trust | **P0** | API multi-tenant suite + E2E duty toggle |
| R7 | Crash or freeze while navigating | Driver loses guidance mid-trip | **P0** (crash while navigating is Critical per BR-2) | E2E long-run + crash reporting |
| R8 | Guidance stops when the app is backgrounded or the screen locks | Missed turns onto unsuitable roads | P1 | Real-device E2E + manual field test |
| R9 | Offline or tunnel dropout loses the route or reports | Driver lost; reports lost or duplicated | P1 | E2E with network shaping |
| R10 | Battery drain above the 7 %/hour budget | Phone dies mid-shift | P1 | Real-device measurement |
| R11 | Reports not created, not shown to nearby drivers, never expire, or are duplicated | Waze-like value lost; stale hazards | P1 | API + E2E |
| R12 | Fleet seat limits or subscription state wrong (trial, past due, cancelled) | Revenue loss or locked-out customers | P2 | API (Stripe test mode) + E2E |
| R13 | Accessibility failures: large text breaks layout, screen reader labels missing, contrast | Unusable for some drivers; app store risk | P2 | Automated a11y checks + manual VoiceOver/TalkBack |
| R14 | Cosmetic and copy issues | Low | P3 | Exploratory |

**Test pyramid.** Push every check as low as it can go: the routing matrix lives in API tests, profile maths in unit tests, and Appium E2E covers only what needs a real device (permissions, GPS, background, offline, layout, gestures). The E2E layer stays small enough for `@smoke` to finish in under 10 minutes.

## 3. Test levels and tools

| Level | Tool | Runs where | What it covers |
|---|---|---|---|
| Unit / component | Jest + React Native Testing Library (app), Vitest / node:test (API) | Every PR | Profile validation and serialisation, formatters, duty-sharing throttle, report metadata, driving-lock logic |
| API / contract | node:test / Vitest + zod schemas; Playwright `request` for black-box runs against staging | Every PR; staging after deploy | Route API contract, `@routing-safety` matrix, reports lifecycle, fleet multi-tenant and duty rules, Stripe webhooks |
| Mobile E2E | **Appium 2 + WebdriverIO (TypeScript), Page Objects** in [`e2e/mobile/`](../../e2e/mobile) | Android emulator nightly and on demand; iOS simulator nightly once the macOS runner is set up; real-device cloud for `@release` | User journeys, permissions, GPS simulation, offline, background, driving lock, a11y labels |
| Accessibility | Appium accessibility-ID and label audits, Xcode Accessibility Inspector, Android Accessibility Scanner, manual VoiceOver/TalkBack | `@regression` + release | Labels, roles, target size, text scaling, contrast |
| Performance / battery | Android `dumpsys batterystats` + Battery Historian, Xcode Instruments (Energy Log) / MetricKit, real devices | `@release` + monthly | 7 %/hour budget, CPU, memory, startup time |
| Field test | Real trucks or a car with a test profile, real routes | Before beta and each major release | GPS in poor signal, tunnels, real background/lock behaviour, voice |

### Selectors

E2E tests use only stable `testID`s, never XPath, screen coordinates or visible text (text is localised). In React Native a `testID` becomes the iOS accessibility identifier (Appium `accessibility id`) and the Android `resource-id`. The page objects hide that difference behind one `byTestId()` helper. Screen-reader labels (`accessibilityLabel`) are tested separately as an accessibility requirement and are not used to find elements. The `testID`s the app must expose are listed in [Appendix A](#appendix-a-testids-the-app-must-expose).

## 4. Suites and tags

Every automated test carries at least one tag in its title. CI selects by tag.

| Tag | Runs | Time budget | Contents | Gate |
|---|---|---|---|---|
| `@smoke` | Every PR (unit + API smoke); mobile smoke on the Android emulator nightly and on demand until it is stable, then on every PR touching `apps/mobile` | < 10 min | App launches to the map, location permission flow, plan one route, open the report sheet, one API health and contract check | Blocks merge |
| `@routing-safety` | Every PR that touches routing (`apps/server/src/lib/routing*`, `routes/route.ts`, truck profile types, the mobile profile screen or the route call), and nightly | < 10 min (fixtures) + live HERE matrix when the `HERE_API_KEY` secret is set | Restriction matrix: profiles × low bridges, weight-limited bridges, hazmat tunnel categories B to E, truck-banned roads; "no safe route"; uncertain data warns. App-level: the profile sent equals the profile saved | **Blocks merge. Any failure is Critical.** |
| `@regression` | Nightly on `main` | < 60 min | Everything functional in this plan that can run on emulators/simulators: GPX journeys, offline, reports lifecycle, fleet privacy, a11y audits, driving lock | Red nightly → triage next business day |
| `@release` | Release candidate on preprod, real devices in the device cloud | < 3 h + battery runs | Full regression on the device matrix, background/locked navigation, battery, low-end Android performance, upgrade from the previous version | Blocks release |

The API suite for routing safety already exists (`apps/server/test/routing*.test.ts`, PR #10). Mobile E2E reuses the same tags so one tag means the same thing everywhere.

## 5. Device and OS matrix

Proposed for November 2026; the owner confirms it against the first beta fleet's real phones. Tier 1 runs every `@release`; tier 2 runs on major releases and monthly.

### iOS

| Device | OS | Why | Tier |
|---|---|---|---|
| iPhone 16 / 17 (6.1") | iOS 26 (current) | Most common current phone | 1 |
| iPhone 13 | iOS 18 (N-1) | Older but common in fleets; slower GPS lock | 1 |
| iPhone SE (3rd gen) | iOS 18 | Small 4.7" screen: layout, target size, large text | 1 |
| iPhone 15 Pro Max | iOS 26 | Large screen, landscape dash mount | 2 |
| iPad (10th gen) | iPadOS 26 | Fleet owners using the in-app fleet screens | 2 |

Simulators in CI: latest iOS on iPhone 16 and iPhone SE.

### Android

| Device | OS (API) | Why | Tier |
|---|---|---|---|
| Google Pixel 8 / 9 | Android 16 (36) | Reference Android, newest permission and background rules | 1 |
| Samsung Galaxy S23 / S24 | Android 15 (35), One UI | Samsung battery optimisation kills background apps | 1 |
| **Samsung Galaxy A15 / A16 (low-end, 4 GB)** | Android 14 (34) | Best-selling budget phone; slow CPU, aggressive battery saver | 1 |
| **Motorola Moto G Play / G 5G (low-end, 3 to 4 GB)** | Android 13 (33) to 14 (34) | Common prepaid phone among owner-operators | 1 |
| Samsung Galaxy XCover 7 (rugged) | Android 14 (34) | Rugged phones fleets issue to drivers | 2 |
| Xiaomi / Redmi Note | Android 13 (33), HyperOS | Most aggressive background killing | 2 |
| Any Android 10 (29) device | Android 10 | Oldest supported OS: background location permission rules changed here | 2 |

Emulators in CI: API 34 and API 36 (Google APIs, x86_64), plus a low-RAM profile (2 GB, 2 cores) for performance smoke.

**Supported floor (proposal):** iOS 17+ and Android 10+ (API 29+). Expo SDK 52 supports lower, but below Android 10 background location behaves differently and the share of truck drivers on those versions does not justify the cost. Needs owner sign-off.

## 6. Environments and test data

| Environment | Used for | API | Data | Payments |
|---|---|---|---|---|
| **unit** | Unit and API tests in CI containers | In-process, no network | Fixtures in the repo | Stripe mocked |
| **staging** | Nightly `@regression`, on-demand mobile E2E, exploratory | `staging` deploy | Seeded fixtures; each test seeds its own org, drivers and reports through the API and deletes them afterwards | Stripe **test mode** |
| **preprod** | Release candidates: `@smoke`, `@routing-safety` (live HERE), `@release` on real devices, k6 | Same image digest that goes to prod, 3 replicas | Anonymised prod-shaped data; test orgs prefixed `qa-` | Stripe test mode |
| prod | Post-deploy health check and a read-only smoke only | prod | Live | Live: no test purchases |

- The mobile build under test points at an environment with `EXPO_PUBLIC_API_URL`. The app never holds API keys (see `docs/secrets.md`); routing keys stay on the server.
- When the server has no HERE key it answers with `provider: "demo"` routes. **A demo route never counts as a pass** for any routing test; tests assert `provider === "here"` on staging and preprod.
- Test credentials and Stripe test keys come from CI secrets at run time. Tests generate mock values with `fakeSecret()`; no key literal is ever committed, mocks included.
- **Truck profiles used throughout** (shared with the API suite):

| Profile | Height | Weight | Length | Axles | Hazmat | Purpose |
|---|---|---|---|---|---|---|
| `dry-van-53` | 4.11 m (13'6") | 36,287 kg (80,000 lb) | 22.0 m | 5 | none | Most common US tractor-trailer |
| `tall-reefer` | 4.27 m (14'0") | 36,287 kg | 22.0 m | 5 | none | Fails more low bridges |
| `tanker-flammable` | 3.96 m | 36,287 kg | 20.0 m | 5 | Class 3, tunnel cat. D | Hazmat routing and tunnel restrictions |
| `explosives-1.1` | 3.96 m | 30,000 kg | 18.0 m | 5 | Class 1, tunnel cat. B | Most restrictive hazmat |
| `box-truck-26` | 3.66 m | 11,793 kg | 10.0 m | 2 | none | Lighter vehicle that may use roads others can't |
| `invalid` | 0 / blank | | | | | Profile validation |

## 7. GPS simulation with GPX tracks

Journeys are driven by GPX tracks stored in `e2e/mobile/fixtures/gpx/`. Each file has a header comment with its source (recorded drive, or synthetic from a known route), the truck profile it is meant for, and what it tests. Reports attach the GPX used to every failure.

**Track library (to build up; the first one ships with the skeleton)**

| Track | Tests |
|---|---|
| `nj-short-loop.gpx` (synthetic, 2 km) | Smoke: position moves, map follows |
| `on-route-arrival.gpx` | Turn-by-turn, banner updates, arrival announced, navigation ends |
| `off-route-detour.gpx` | Leaves the route → "Rerouting" → new route still truck-safe for the profile (P0) |
| `off-route-into-restriction.gpx` | Driver deviates toward a low bridge; the reroute must not go under it (P0) |
| `tunnel-dropout.gpx` | Fixes stop for 90 s, then resume 2 km on: "Searching for GPS", dead reckoning or last route kept, recovery |
| `urban-canyon-jitter.gpx` | Noisy fixes (±50 m, accuracy 65 m): no reroute storm, no wrong-side snapping |
| `stop-and-go.gpx` | Speed crosses the walking threshold repeatedly: driving lock engages and releases without flicker |
| `highway-long-1h.gpx` | One hour at 100 km/h: memory, battery, crash-free run |

**How to play a track**

| Platform | Mechanism | Speed and heading |
|---|---|---|
| Android emulator | Appium UiAutomator2 `mobile: setGeolocation` (uses the Appium Settings mock-location provider), or the emulator console: `adb emu geo fix <lon> <lat> [alt] [satellites] [velocity-knots]` | Passed per fix; the GPX helper interpolates between points at the requested speed |
| Android real device | Appium Settings as the mock-location app (Developer options → Select mock location app), driven by `mobile: setGeolocation` | Same |
| iOS simulator | `xcrun simctl location <udid> start --speed=<m/s> --interval=1 <lat,lon> <lat,lon> …` for a continuous drive; `xcrun simctl location <udid> set <lat,lon>` for a single fix; `xcrun simctl location <udid> clear` to stop. Appium XCUITest `mobile: setSimulatedLocation` for single fixes | `--speed` sets the simulated speed the app reads in `coords.speed` |
| iOS real device | XCUITest `mobile: setSimulatedLocation` (iOS 16.4+ with Xcode 14.3+), or Xcode → Debug → Simulate Location with the GPX file | Speed is derived from successive fixes |

The helper in [`e2e/mobile/src/support/gpx.ts`](../../e2e/mobile/src/support/gpx.ts) parses GPX, resamples it to one fix per second at a chosen speed, and [`geo.ts`](../../e2e/mobile/src/support/geo.ts) sends the fixes to the device. Tests wait on app state (for example "turn banner shows the next manoeuvre"), never on fixed sleeps.

**GPS accuracy in poor signal (field test).** The emulator cannot reproduce multipath and weak satellites, so before beta and each major release a field tester drives three fixed routes: downtown with tall buildings, a long tunnel (e.g. Lincoln or Holland Tunnel approaches, as a passenger vehicle), and a rural stretch with weak cellular coverage. Record a GPX on the device, a screen recording, and note every wrong snap, false reroute and recovery time. Recovery target: back on the correct road within 10 s of a good fix.

## 8. Test areas and scenarios

IDs are stable so Jira bugs and test code can reference them (e.g. `TB-NAV-04`). "Auto" says where it is automated; "Manual" items are run from this plan during release testing.

### 8.1 Truck profile (UC-01, UC-02)

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-PRF-01 | Save each reference profile; reopen the app; the profile persists exactly (no unit drift) | P0 | E2E `@regression` |
| TB-PRF-02 | The route request carries the saved height, width, length, weight, axles and every hazmat class (intercept the request on staging, or assert server-side request log by test org) | P0 | E2E + API `@routing-safety` |
| TB-PRF-03 | Changing the profile while a route is shown recomputes the route; the old route is not kept | P0 | E2E `@routing-safety` |
| TB-PRF-04 | Zero, blank, negative and absurd values (e.g. 40 m height) cannot be saved | P1 | Unit + E2E |
| TB-PRF-05 | Hazmat load changed mid-trip (load delivered or picked up) triggers a reroute with the new class | P0 | E2E |
| TB-PRF-06 | The profile cannot be edited while moving (driving lock) | P0 | E2E with simulated speed |

### 8.2 Routing in the app (UC-03, UC-04)

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-RTE-01 | Long-press sets a destination; a truck-safe route draws; ETA and distance shown | P0 | E2E `@smoke` |
| TB-RTE-02 | For each case in the `@routing-safety` matrix, the app shows the same route the API returned (the app never draws a cached or car route) | P0 | API + E2E sample |
| TB-RTE-03 | No truck-safe route exists → clear "No truck-safe route" message, no route drawn, no fallback to a non-truck route (UC-04) | P0 | API + E2E |
| TB-RTE-04 | Restriction data missing or uncertain on the route → warning shown before the driver starts | P0 | API + E2E |
| TB-RTE-05 | `provider: "demo"` is labelled "demo route" and never appears on preprod or prod | P0 | E2E + preprod smoke |
| TB-RTE-06 | Route API error or timeout → readable error, retry, no stale route | P1 | E2E with network shaping |

### 8.3 Navigation, voice and rerouting (UC-05)

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-NAV-01 | Start navigation: turn banner and ETA card shown; map follows the position along `on-route-arrival.gpx` | P1 | E2E |
| TB-NAV-02 | Voice instruction spoken before each turn (assert TTS event via debug hook on test builds; manual listen on release) | P1 | E2E + manual |
| TB-NAV-03 | Mute toggles with one tap; banner keeps updating | P2 | E2E |
| TB-NAV-04 | Off route → "Rerouting" → new route requested with the same profile and is truck-safe | P0 | E2E `@routing-safety` with `off-route-into-restriction.gpx` |
| TB-NAV-05 | Reroute finds no safe route → UC-04 flow, guidance does not silently continue on the old route | P0 | E2E |
| TB-NAV-06 | GPS lost (tunnel) → "Searching for GPS", last route kept, recovers on signal | P1 | E2E `tunnel-dropout.gpx` |
| TB-NAV-07 | Arrival announced, navigation ends, trip recorded (fleet trip history) | P1 | E2E + API |
| TB-NAV-08 | One-hour drive: no crash, memory stable (< 10 % growth after warm-up) | P0 | `@release` real device |

### 8.4 Driver safety: driving lock

Non-negotiable #1: above walking speed (proposal: 8 km/h, owner to confirm) only single large glanceable actions are available.

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-LCK-01 | At simulated speed > threshold every text input is disabled or hidden (profile, join fleet, plans) | P0 | E2E |
| TB-LCK-02 | While moving, only the report button, mute, end navigation and report-ahead "Still there / Gone" are tappable; each ≥ 64 pt / 64 dp | P0 | E2E + a11y audit |
| TB-LCK-03 | Report flow while moving is one tap after opening the sheet; no typing, sheet closes itself | P0 | E2E `@smoke` |
| TB-LCK-04 | Stop-and-go across the threshold does not flicker the lock (hysteresis) | P1 | E2E `stop-and-go.gpx` |
| TB-LCK-05 | Native alerts (duty change, report confirm) are not shown while moving; replaced by large cards or voice | P0 | E2E |

### 8.5 Offline and flaky network

Network control: Android `adb shell svc wifi disable` / `svc data disable` and Appium `driver.setNetworkConnection`; emulator `-netspeed`/`-netdelay`; iOS simulator via Network Link Conditioner on the macOS runner; real devices through the device cloud's network profiles.

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-OFF-01 | Airplane mode mid-route: route, guidance and map tiles already loaded keep working | P1 | E2E |
| TB-OFF-02 | Report filed offline is queued, shown as "pending", sent once on reconnect, never duplicated (idempotency key) | P1 | E2E + API |
| TB-OFF-03 | Tunnel dropout 90 s during navigation: no crash, no reroute storm on reconnect | P1 | E2E |
| TB-OFF-04 | Start the app with no network: clear offline state; no blank map; no endless spinner | P1 | E2E |
| TB-OFF-05 | Slow 2G (500 ms latency, 50 kbps): route request times out gracefully with retry | P2 | E2E |
| TB-OFF-06 | Duty position updates queued offline are sent in order on reconnect, and none are sent if the driver went off duty meanwhile | P0 (privacy) | API + E2E |

### 8.6 Background and locked-screen navigation

The current app requests only "while using" location and shares position in the foreground (BR-5 adds background). These tests become active with BR-5.

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-BG-01 | Navigating, press Home: voice guidance continues; position keeps updating (iOS blue pill / Android foreground-service notification visible) | P1 | `@release` real device |
| TB-BG-02 | Screen locked 30 min during navigation: guidance continues; returning shows the correct position | P1 | `@release` real device |
| TB-BG-03 | App killed by the OS (Android "Don't keep activities", low-memory kill): relaunch restores the trip or explains it ended | P1 | E2E + real device |
| TB-BG-04 | Location permission "While using" vs "Always" vs "Precise off" vs denied: each has a clear explanation and a path to Settings; denial never crashes | P1 | E2E |
| TB-BG-05 | Samsung/Xiaomi battery optimisation on: guidance survives 30 min in background, or the app tells the driver how to exempt it | P1 | `@release` tier 1/2 Android |
| TB-BG-06 | Incoming phone call and Bluetooth audio route switch during navigation: voice resumes after the call | P2 | Manual |
| TB-BG-07 | Background location is never collected while not navigating and off duty | P0 (privacy) | Real device: OS location indicators + API logs |

### 8.7 Battery: 7 % per hour budget

**Budget:** during active navigation the app may use at most **7 % of battery per hour** on tier-1 devices.

**Method (lab, every `@release`):**

1. Real devices only (emulators don't model battery). Fully charge, then unplug and let the device settle to 90 to 95 %.
2. Fixed conditions: brightness 50 % (auto-brightness off), Wi-Fi off, cellular on, Bluetooth on, volume 50 % with voice guidance on, no other apps running, battery saver off, device at room temperature.
3. Start navigation and replay `highway-long-1h.gpx` through the mock-location provider for **60 minutes**, screen on in the navigation view (typical dash-mount use).
4. Measure:
   - **Android:** `adb shell dumpsys batterystats --reset` before; afterwards `adb shell dumpsys batterystats > stats.txt` and `adb bugreport` into Battery Historian for per-app attribution. Run over wireless adb (`adb tcpip` / `adb pair`) so USB does not charge the phone. Read the level from `adb shell dumpsys battery` at start and end.
   - **iOS:** untethered run; read the start and end level from Settings → Battery (or a test-build hook sampling `UIDevice.batteryLevel` every minute); Xcode Instruments → Energy Log on a tethered companion run for attribution; MetricKit reports from TestFlight users for field data.
5. Run 3 times per device. **Pass:** median ≤ 7.0 %/h and no single run > 8.0 %/h. Report drain per hour, the baseline (same device, same 60 min, screen on showing the home screen with only location services) and the delta.
6. Also measure **background navigation with the screen off** (TB-BG-02 conditions) and **idle with the app open and off duty**; targets to be set from the first baseline.

**Field check:** a field tester logs the battery level at the start and end of a real 2-hour drive on one iOS and one Android tier-1 device each release.

A failed budget is a High bug (Medium if within 1 %/h of the budget and the owner accepts it for one release).

### 8.8 Community reports lifecycle (UC-06, UC-07)

TTLs today (`apps/server/src/lib/store.ts`): crash 60 min, police 30 min, closure 4 h, hazard 45 min, low clearance 30 days, scale open/closed 90 min, parking full 60 min. A confirmation resets the expiry to the full TTL from now.

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-REP-01 | Create each of the 8 report types from the sheet in one tap; it appears on the map and on a second test device nearby within 5 s (`report:new`) | P1 | E2E `@regression` (two sessions) + API |
| TB-REP-02 | Report not sent (API down) → clear error; nothing shown as sent | P1 | E2E |
| TB-REP-03 | "Still there" increments confirmations, extends expiry to now + TTL, broadcasts `report:updated` | P1 | API + E2E |
| TB-REP-04 | "Gone": no extension (current behaviour); test updated once BR-34's open question on early removal is decided | P2 | API |
| TB-REP-05 | Expiry: with a clock-controlled test API (or short TTLs on staging), the report disappears from `GET /api/reports` and from the map after TTL; confirming an expired report returns 404 and the pin is removed quietly | P1 | API + E2E |
| TB-REP-06 | Duplicates: two drivers report the same hazard within 200 m and 10 min → one report with 2 confirmations (dedupe is not implemented yet; test written as pending) | P2 | API |
| TB-REP-07 | Report-ahead card while navigating: "Crash 2 km ahead · 12 min ago · confirmed by 3", auto-dismisses, never needs typing | P1 | E2E |
| TB-REP-08 | Validation: invalid type, lat/lng out of range, note > 140 chars → 400 | P2 | API |
| TB-REP-09 | Abuse: rate limit on report creation per driver (once implemented) | P2 | API |

### 8.9 Fleet privacy and multi-tenancy

Driver location is personal data. It is shared **only with the driver's own company and only while on duty** (non-negotiable #4).

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-FLT-01 | Off duty: positions sent by the app are rejected or dropped; the fleet sees "off duty" and no position, live or historical | P0 | API + E2E |
| TB-FLT-02 | On duty: position appears on the fleet dashboard within 30 s; going off duty stops sharing immediately and the last position is not shown as live | P0 | API + E2E |
| TB-FLT-03 | Company A's owner/dispatcher cannot read company B's drivers, trips, positions or reports: list, detail by ID (guessed or copied), CSV export, Socket.IO room join (`org:<id>`) | P0 | API (security-relevant: findings to `truckbeez-security-engineer`) |
| TB-FLT-04 | A driver who leaves the fleet stops sharing at once; the old company keeps only on-duty history it is entitled to | P0 | API |
| TB-FLT-05 | Duty consent screen shown before joining; declining joins nothing | P1 | E2E |
| TB-FLT-06 | Trip history only contains on-duty segments | P0 | API |
| TB-FLT-07 | Identity cannot be spoofed: a client cannot act as another user by changing a header or ID in the request | P0 | API (security) |
| TB-FLT-08 | Subscriptions (Stripe test mode): trial, active, past due, cancelled; seat limit blocks the next invite with a clear message; cancelled plan hides live tracking but keeps exports per policy | P2 | API + E2E |

### 8.10 Accessibility

Targets from the UX specs: tap targets ≥ 48 dp/44 pt everywhere and ≥ 64 for driving actions; WCAG 2.2 AA contrast in both day and night themes; usable at the largest system text size.

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-A11Y-01 | Every interactive element has an accessible label and role (audit walks each screen and fails on unlabeled buttons) | P2 | E2E `@regression` |
| TB-A11Y-02 | Largest text size (iOS Accessibility XXXL, Android font scale 2.0): no clipped or overlapping text on map, sheet, profile, fleet screens | P2 | E2E screenshots + manual |
| TB-A11Y-03 | VoiceOver and TalkBack can complete: set profile, plan route, file a report, go on/off duty | P2 | Manual `@release` |
| TB-A11Y-04 | Contrast of text and report glyphs on map pins in night mode | P2 | Manual + design tokens check |
| TB-A11Y-05 | Driving actions meet the 64 pt/dp target (measured from element rect) | P0 (driver safety) | E2E |
| TB-A11Y-06 | Report types are not distinguished by colour alone (glyph + label) | P2 | Manual |

### 8.11 Install, upgrade, and platform

| ID | Scenario | Pri | Layer |
|---|---|---|---|
| TB-PLT-01 | Fresh install → onboarding → permissions → map | P1 | E2E `@smoke` |
| TB-PLT-02 | Upgrade from the previous store version keeps the truck profile and fleet membership | P0 (lost profile = wrong route) | `@release` |
| TB-PLT-03 | Rotation and split-screen: no state loss mid-route | P2 | E2E |
| TB-PLT-04 | Cold start ≤ 3 s on tier-1, ≤ 5 s on low-end Android | P2 | `@release` |
| TB-PLT-05 | CarPlay / Android Auto (when in scope) | — | Future |

## 9. Entry and exit criteria

**Entry (a build is ready for testing)**

- Unit, API and `@routing-safety` suites green on the commit; secret scan green.
- Build installed from CI artifacts (not a local build), version and commit shown in the app's About screen.
- Target environment healthy (`/health`, `/version` match the build).
- Release notes list the Jira keys in the build.

**Exit (release candidate can ship)**

- `@smoke`, `@routing-safety` (including the live HERE matrix on preprod) and `@regression` green on the release commit.
- `@release` run complete on all tier-1 devices; battery budget met.
- **Zero open Critical bugs.** Zero open High bugs for beta and launch (BR-2 done criteria); any other open High has a written owner waiver in the Jira issue.
- Every P0 scenario in section 8 executed on this release with evidence linked.
- No test quarantined for more than 7 days in a P0 area.
- Crash-free sessions ≥ 99.5 % in the previous beta build (once crash reporting is live).

## 10. Flaky test policy

- A test that fails and then passes on the same commit without a code change is flaky.
- Retries are not a fix. CI may retry a failed E2E spec **once** only to collect a second set of evidence; the run still reports the first failure as flaky.
- Within 24 hours the test is either fixed or **quarantined**: tagged `@quarantine`, excluded from gating suites, and linked to a Jira bug (label `flaky-test`, parent BR-2) with the failure evidence and a suspected cause.
- Quarantined tests still run nightly in a non-gating job so we know when they are stable again.
- Root-cause first: missing wait condition, shared data between tests, emulator resource limits, real app race. A real app race is filed as an app bug, not a test bug.
- **`@routing-safety` tests are never quarantined.** A flaky safety test blocks the merge until fixed, because "sometimes unsafe" is unsafe.
- Weekly: QA reviews the flake rate per suite (target < 2 % of runs) and the quarantine list.

## 11. Reporting

Each run publishes:

| Item | Where |
|---|---|
| Pass/fail summary per tag, device and OS | GitHub Actions job summary + Allure report artifact (`e2e/mobile/reports/allure-results`) |
| JUnit XML | `reports/` artifact, for trend tracking |
| On failure: screenshot, screen recording, page source (UI tree), device log (`logcat` / simulator `log stream`), Appium server log, the GPX file and truck profile used | Allure attachments on the failed test |
| Battery and performance numbers | Release QA sign-off comment on the release Jira issue |

Release QA sign-off, posted on the release ticket:

```
Release <version> (<commit>) QA sign-off
Suites: @smoke ✓ | @routing-safety ✓ (fixtures + live HERE N cases) | @regression ✓ | @release ✓ (devices: …)
Battery (median %/h): iPhone 13 x.x | Pixel 9 x.x | Galaxy A15 x.x   (budget 7.0)
Open bugs: Critical 0 | High 0 | Medium n | Low n
Quarantined tests: n (links)
Waivers: none / links
Decision: GO / NO-GO
```

Failures are filed as Jira bugs with the template in [`bug-triage.md`](bug-triage.md), parented to BR-2 and linked to the story they affect.

## 12. Schedule and responsibilities

| Activity | Who | When |
|---|---|---|
| Maintain plan, suites, quality gates | QA automation | Ongoing |
| Add `testID`s (Appendix A) and test hooks to the app | `truckbeez-fullstack-engineer` | Before mobile `@smoke` can gate |
| macOS runner and device-cloud credentials for iOS and `@release` | `truckbeez-devops-specialist` | Before first beta |
| Multi-tenant and spoofing findings | `truckbeez-security-engineer` | As found |
| Device matrix, battery budget, driving-lock threshold, support floor sign-off | Owner (Dayo) | Before first beta |
| Field tests (GPS poor signal, tunnels, real drive battery) | QA + a volunteer driver | Before beta and each major release |

## Appendix A: `testID`s the app must expose

Kebab-case, stable, never translated. Dynamic parts use the report type, driver ID or trip ID. The same list lives in code at [`e2e/mobile/src/testIds.ts`](../../e2e/mobile/src/testIds.ts); keep them in sync. `Button` and `HexButton` need a `testID` prop passed through to their `Pressable`.

**Map screen (`MapScreen.tsx`)**

| testID | Element |
|---|---|
| `map-screen` | Root `View` |
| `map-view` | `MapView` |
| `profile-chip` | Truck profile chip (height · weight · hazmat) |
| `duty-toggle` | On/off duty chip (fleet drivers) |
| `fleet-chip` | "Fleet" chip (not in a fleet) |
| `map-error-banner` | Error text (location off, route failed) |
| `trip-card` | Bottom trip card |
| `trip-hint` | "Press and hold the map to set a destination" |
| `trip-eta` | ETA text |
| `trip-distance` | Distance text (includes "(demo route)") |
| `destination-marker` | Destination `Marker` |
| `report-pin-<reportId>` | Each report `Marker` |
| `report-button` | Hex "Report" button |

**Report sheet (`ReportSheet.tsx`)**

| testID | Element |
|---|---|
| `report-sheet` | Sheet container |
| `report-sheet-backdrop` | Backdrop (closes) |
| `report-option-<type>` | One per type: `accident`, `low_clearance`, `closure`, `hazard`, `police`, `weigh_open`, `weigh_closed`, `parking_full` |
| `report-sheet-cancel` | Cancel |

**Truck profile (`ProfileScreen.tsx`)**

| testID | Element |
|---|---|
| `profile-screen` | `ScrollView` |
| `profile-input-heightCm`, `profile-input-widthCm`, `profile-input-lengthCm`, `profile-input-grossWeightKg`, `profile-input-axleCount` | Inputs |
| `hazmat-switch-<class>` | `flammable`, `explosive`, `gas`, `corrosive`, `poison`, `radioactive` |
| `profile-save` | Save truck |

**Fleet screens**

| testID | Screen / element |
|---|---|
| `fleet-screen`, `fleet-manage-button`, `fleet-join-button`, `fleet-duty-button`, `fleet-leave-button`, `fleet-duty-status` | `FleetScreen` |
| `join-fleet-screen`, `join-code-input`, `join-name-input`, `join-continue`, `join-consent`, `join-consent-agree`, `join-consent-decline` | `JoinFleetScreen` |
| `fleet-plans-screen`, `plan-option-<planId>`, `plans-company-input`, `plans-name-input`, `plans-seats-input`, `plans-subscribe`, `plans-start-trial` | `FleetPlansScreen` |
| `fleet-dashboard`, `fleet-tile-on-duty`, `fleet-tile-driving`, `fleet-tile-km-week`, `driver-row-<driverId>`, `fleet-invite`, `fleet-export-csv` | `FleetDashboard` |
| `driver-detail-screen`, `range-<days>`, `trip-row-<tripId>`, `stat-distance`, `stat-driving`, `stat-idle`, `stat-off-route` | `DriverDetailScreen` |

**Navigation and safety (screens not built yet: add when BR-5 / UC-04 / UC-05 / UC-07 land)**

| testID | Element |
|---|---|
| `nav-screen`, `nav-turn-banner`, `nav-turn-distance`, `nav-eta-card`, `nav-mute-toggle`, `nav-end` | Navigation view |
| `nav-rerouting-banner`, `gps-searching-banner`, `offline-banner` | State banners |
| `no-safe-route-card`, `route-data-warning` | UC-04 and uncertain-restriction warning |
| `report-ahead-card`, `report-ahead-still-there`, `report-ahead-gone` | UC-07 (replaces the native `Alert` used today) |
| `driving-lock-overlay` | Shown when inputs are locked because the truck is moving |
| `report-pending-<localId>` | Report queued offline |

## Appendix B: gaps found while writing this plan

Observed in the BR-38 starter app (branch `feat/BR-38-starter-app-and-fleet`). Each becomes a Jira item once that code is on `main`.

1. **No `testID`s anywhere** in the app: mobile E2E cannot gate until Appendix A is done.
2. **No driving lock yet**: the profile, join-fleet and plans screens accept typing at any speed (non-negotiable #1). Covered by TB-LCK-01.
3. **Report confirm and duty change use native `Alert` dialogs**: small text, two-button choice while driving. TB-LCK-05.
4. **Background navigation not possible yet**: iOS requests only "while using"; Android has no background-location or foreground-service permission. TB-BG-* blocked on BR-5.
5. **No offline queue**: a failed position or report send is dropped (`useDutySharing` comment says "offline queue is a TODO"). TB-OFF-02, TB-OFF-06.
6. **No report dedupe** on the server. TB-REP-06.
7. **Fleet API identifies the caller from a request header** in the starter code: spoofing risk to confirm with `truckbeez-security-engineer` (TB-FLT-07).
