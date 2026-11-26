# testID inventory: driver app, ADR-0003 step E1

The `testID`s in the BR-29 and BR-31 UX specs (PR #17, `docs/design/`) are the Appium contract (QA plan, PR #21). Appium reads them as `accessibilityId` on iOS and as `resource-id`/content-desc on Android. This file is the gate C7 inventory: spec vs. implemented, plus the renames from PR #2's starter app. **Update it in the same PR as any `testID` change.**

Legend: ✅ implemented in E1 · ⏳ not yet, with the reason and the item that unblocks it.

## BR-29 truck details editor (spec §13.1)

| testID | E1 | Notes |
|---|---|---|
| `truckProfile.screen` | ✅ | |
| `truckProfile.units` / `.units.imperial` / `.units.metric` | ✅ | radio group, `checked` state |
| `truckProfile.{height,width,length}.ft` / `.in` / `.cm` | ✅ | `.cm` in metric only |
| `truckProfile.{height,width,length}.stored` | ✅ | "Saved as … cm" |
| `truckProfile.{height,width,length}.error` / `.warning` | ✅ | |
| `truckProfile.height.preset.13-6`, `.14-0`; `truckProfile.width.preset.8-6` | ✅ | ⏳ weight `80,000 lb` and metric presets |
| `truckProfile.weight.lb` / `.kg` / `.stored` / `.error` / `.warning` | ✅ | |
| `truckProfile.axles.value` / `.decrement` / `.increment` / `.error` | ✅ | `.error` isn't in the spec table but follows its pattern (spec §13.1 to add) |
| `truckProfile.hazmat.toggle` | ✅ | |
| `truckProfile.hazmat.class.{1-9}` | ✅ | checkbox + checked state |
| `truckProfile.hazmat.error` | ✅ | |
| `truckProfile.tunnel.{B,C,D,E,notSure}` | ✅ | radio + `checked` state; "Not sure" sends `B` (BR-73) |
| `truckProfile.summary` | ✅ | |
| `truckProfile.save` | ✅ | always enabled (AC-8) |
| `truckProfile.hazmat.division.{1.1…6.2}` | ⏳ | unblocked: the API accepts divisions (PR #28, merged); editor UI not built yet |
| `truckProfile.hazmat.pih` | ⏳ | unblocked (PR #28 merged); editor UI not built yet |
| `truckProfile.hazmat.combustible` / `.envHazard` | ⏳ | BR-74 owner decision (server mapping) |
| `truckProfile.hazmat.placards` | ⏳ | follows the division UI |
| `truckProfile.hazmat.avoids` | ⏳ | spec §5.2: the app must read the server's mapping; move it from `services/api` to `@truckbeez/shared` first |
| `truckProfile.saveError` | ⏳ | no profile API yet (BR-3); E1 saves on the device |
| `truckProfile.movingLock` / `.movingLock.ok` | ✅ | BR-78: entry while moving and edit paused by driving (02g) |
| `app.mapLayer` | ✅ | BR-78: map layer; `importantForAccessibility="no-hide-descendants"` while a lock or the editor covers it (TalkBack) |
| `truckProfile.draftBanner` / `.draftBanner.review` / `.draftBanner.discard` | ✅ | BR-78: draft kept after driving interrupts an edit |
| `truckProfile.review` / `.unsaved` (+ children) | ⏳ | flows §8.1–8.2 |
| `map.routeChangedBanner`, `toast.profileSaved`, `toast.routeStillSafe` | ⏳ | need an active-route (navigating) state |

## BR-31 route errors (spec §8.6)

| testID | E1 | Notes |
|---|---|---|
| `routeError.sheet` | ✅ | |
| `routeError.sheet.variant` | ✅ | `accessibilityValue.text` = `noSafeRoute` \| `unavailable` \| `offline` |
| `routeError.title` / `.destination` | ✅ | title has role `header` and gets focus on open |
| `routeError.reason.{index}` / `.reason.{index}.kind` / `.reason.more` | ✅ | |
| `routeError.profileSummary` | ✅ | |
| `routeError.action.checkTruck` / `.action.otherDestination` | ✅ | 422 only |
| `routeError.action.retry` | ✅ | 502 / offline only, shows "Trying…" while busy |
| `routeError.close` | ✅ | |
| `map.routeLine` | ✅ | **absent in every error state** (tested) |
| `map.profileChip` | ✅ | |
| `routeError.banner` / `.banner.repeat` | ✅ | BR-78: in-motion 04c / 04d, Repeat ≥ 72 dp |

**Coverage:** BR-31: 11 of 11 rows ✅. BR-29: 16 of 24 rows ✅. Open BR-29 rows: the division/PIH/placards/avoids UI (unblocked, next), combustible/marine (BR-74), save errors (BR-3), the review/unsaved flows (§8), and active-route banners.

## Added in E1 (not in the specs)

| testID | Element |
|---|---|
| `truckProfile.back` | Editor back button (48 dp) |
| `routeError.stillNone` | "Still no safe route with your updated details." (BR-31 §3.3 state) |
| `routeError.assumption.{i}` | Safety assumption shown on the 422 sheet (ADR-0003 S3: it may be why there is no route) |
| `route.panel` | Bottom panel; scrolls so the sheet stays reachable at large font sizes |
| `map.view`, `map.destination` | Map and destination marker |
| `route.origin`, `route.destination`, `route.submit` | Trip entry ("lat, lng" until destination search lands) |
| `route.loading`, `route.summary`, `route.safetyAssumption.{i}`, `route.invalid` | Route states |
| `route.needsProfile`, `route.setTruck` | No truck details yet (BR-29 §9: no route request without them) |
| `routeError.banner.variant` | Hidden variant marker on the in-motion banner (`noSafeRoute` \| `unavailable` \| `offline`) |
| `route.parkToPlan` | "Park to plan a route": replaces the trip fields while moving (NFR-10) |
| `route.locationNeeded`, `route.allowLocation` | Location denied: the app stays locked (no evidence of parking) and asks again |

## Renamed from PR #2's starter app (C7 diff)

| PR #2 | Now |
|---|---|
| `truck-height`, `truck-width`, `truck-length` | `truckProfile.{height,width,length}.ft` (+ `.in`) |
| `truck-weight` | `truckProfile.weight.lb` |
| `truck-axles` | `truckProfile.axles.value` / `.increment` / `.decrement` |
| `hazmat-toggle`, `hazmat-class-{n}` | `truckProfile.hazmat.toggle`, `truckProfile.hazmat.class.{n}` |
| `route-origin`, `route-destination`, `plan-route` | `route.origin`, `route.destination`, `route.submit` |
| `eta-card` | `route.summary` |
| `no-safe-route`, `route-error` | `routeError.sheet` (variant `noSafeRoute` / `unavailable`) |
| `check-truck-details`, `choose-another-destination`, `try-again` | `routeError.action.checkTruck`, `.action.otherDestination`, `.action.retry` |
| `form-error` | `route.invalid`, `truckProfile.{field}.error` |

PR #3's app had no `testID`s on the screens E1 ports.
