# TruckBeez event tracking plan

**Jira:** BR-57 · **Owner:** `truckbeez-data-engineer-analyst` · **Status:** draft for review · **Schema version:** `2026-11-07.1`

This is the readable version of the plan. The machine-readable source of truth is [`events.schema.json`](events.schema.json). If they disagree, the JSON wins and this file is wrong. The check `node --test "docs/data/*.test.mjs"` (run in CI by `.github/workflows/data-schema.yml`) validates the JSON, the envelope, the privacy guards and every example payload.

**Hands off to:** full-stack (instrumentation, ingest endpoint), security (privacy review, see [section 6](#6-for-security-review)), AI architect (datasets, see [section 8](#8-hand-offs)), DevOps (job scheduling, secret).

Contents:
1. [Principles](#1-principles)
2. [Naming and versioning](#2-naming-and-versioning)
3. [Common envelope](#3-common-envelope)
4. [Events](#4-events)
5. [Privacy rules](#5-privacy-rules)
6. [For security review](#6-for-security-review)
7. [KPI glossary](#7-kpi-glossary)
8. [Pipeline recommendation](#8-pipeline-recommendation)
9. [Hand-offs](#9-hand-offs)
10. [Open questions for the owner](#10-open-questions-for-the-owner)

---

## 1. Principles

1. **Analytics is not the fleet product.** Fleet live maps, trip reports, replay and CSV export (BR-41..BR-43) read the operational fleet tables, which already hold exact positions under the on-duty, consent and 90-day rules. Analytics events never feed a fleet customer's screen and never carry positions. That keeps the two privacy stories separate and simple.
2. **Measure decisions, not movement.** No event fires per GPS fix. Breadcrumbs are not analytics. The busiest event (`off_route` or `reroute`) fires a few times per trip.
3. **The server emits what the server knows.** Routing outcomes, reports, votes, duty, invites and billing are emitted by the API, so they can't be lost offline or forged. The app emits only what only the app sees (navigation, arrival, warnings shown, crashes, battery).
4. **Identifiers are set by the server.** The app never sends `user_id` or `company_id`. The ingest endpoint derives both from the authenticated session and the driver's duty state at `ts`.
5. **Closed schemas.** Every `properties` object is `additionalProperties: false`. A new field needs a schema change and review. Nothing slips in by accident.

## 2. Naming and versioning

**Event names**
- `snake_case`, lowercase, 3–48 characters, `^[a-z][a-z0-9_]{2,47}$`.
- Default form is `object_past_tense_verb`: `route_requested`, `report_created`, `duty_changed`.
- Accepted exceptions: `no_safe_route`, `reroute`, `off_route` and `app_crash` name a state or occurrence, not an action. They stay as is because Jira, the API (`NO_SAFE_ROUTE`) and the use cases already use these words. New events follow the default form.
- No platform, screen or version in the name (`ios_route_started` and `route_started_v2` are wrong). Those belong in the envelope.

**Property names**
- `snake_case`. Units go in the suffix: `_s`, `_ms`, `_km`, `_m`, `_pct`, `_cents`. Bands end in `_band`. Booleans read as `is_`/`has_`/`was_`/past participle (`voice_enabled`).
- Enums are lowercase `snake_case` strings. Unknown is a real value (`unknown`), not `null`, when the client can't tell.
- Names on the banned list in the JSON (`lat`, `lng`, `email`, `note`, `vin`, `ip`, `invite_code`, and so on) fail CI, even with a new meaning.

**Versioning (`event_version`)**
- An integer per event, starting at 1, pinned with `const` in the schema.
- **No bump (additive):** a new *optional* property or a new enum value that old consumers can treat as "other". Update the JSON and the `x-schema-version` date.
- **Bump (breaking):** renaming or removing a property, changing a type or unit, making a property required, or changing what triggers the event. The new version is a new schema entry. The app sends the new version, and the ingest accepts both until no app build older than two releases is above 1% of sessions. Staging models cover both versions until then.
- `x-schema-version` (`YYYY-MM-DD.n`) versions the file as a whole.
- Every change to the schema is a PR that touches `events.schema.json`, this file and the emitting code together.

## 3. Common envelope

Every stored event has these top-level fields. Event-specific data sits under `properties`. Unknown top-level fields are rejected.

| Field | Type | Set by | Rules |
|---|---|---|---|
| `event_id` | UUID (lowercase) | emitter | Random UUIDv4 (or v7). Dedupe key: a repeat `event_id` is stored once. Stripe-driven events use UUIDv5 of the Stripe event id, so webhook retries dedupe. |
| `event_name` | string | emitter | One of the events below. |
| `event_version` | integer ≥ 1 | emitter | See versioning. |
| `ts` | RFC 3339 UTC, ms | emitter | When it happened, emitter clock. Ingest keeps it but flags a skew over 24 h (`ts` vs `received_at`). |
| `received_at` | RFC 3339 UTC, ms | ingest | Server receive time. Partition key in storage. |
| `user_id` | string | **ingest** | `u_` + first 128 bits of HMAC-SHA256(`ANALYTICS_ID_KEY`, internal user id), hex. Before sign-up: `anon_` + HMAC of a random per-install id kept in secure storage. Server-side system actors: `sys_<name>` (e.g. `sys_stripe`). At sign-up the ingest writes one `anon_ → u_` link row so the install funnel survives. |
| `company_id` | string or **null** | **ingest** | `c_` + HMAC of the fleet org id. Only set when the event's `x-company-scope` allows it (see [5.3](#53-fleet-scoped-data-and-off-duty-drivers)). Otherwise `null`. |
| `session_id` | UUID or null | client | New random UUID on cold start or after 30 min in the background. `null` for server events with no client session (webhooks, timeouts). The API copies the client's `X-Session-Id` header onto server events. |
| `app_version` | string ≤ 40 | emitter | Mobile `1.4.0+212`. API: its version / git SHA (`APP_VERSION`). |
| `platform` | `ios` · `android` · `web` · `server` | emitter | |
| `source` | `client` · `server` | emitter | |
| `env` | `development` · `unit` · `staging` · `preprod` · `prod` | emitter | KPIs use `prod` only. |
| `properties` | object | emitter | Event-specific, closed schema. |

`event_name`, `received_at`, `source` and `env` were added to the brief's envelope. They are needed for dedupe, partitioning and keeping test traffic out of KPIs.

`ANALYTICS_ID_KEY` is a secret like any other: it lives in the environment's secret store, differs per environment, and tests use `fakeSecret()`. Rotating it breaks joins across the rotation, so rotate only on compromise.

## 4. Events

Columns: **Src** = client (C) or server (S). **Company** = whether `company_id` may be set (`never`, `on_duty`, `fleet_admin`, see [5.3](#53-fleet-scoped-data-and-off-duty-drivers)). **Geo** = the most precise location the event may carry. Full types, ranges and examples are in the JSON.

### Summary

| Event | Src | Family | Company | Geo | Trigger | Owner |
|---|---|---|---|---|---|---|
| `app_opened` | C | product | never | none | First screen after a cold start, or foreground after ≥ 30 min | full-stack (mobile) |
| `route_requested` | S | routing_safety | on_duty | none | API finished `POST /api/route`, any outcome | full-stack (API) |
| `no_safe_route` | S | routing_safety | on_duty | admin1 | API returned `422 NO_SAFE_ROUTE` (UC-04) | full-stack (API) |
| `route_started` | C | product | on_duty | none | Driver taps Start; navigation view opens | full-stack (mobile) |
| `reroute` | C | product | on_duty | none | A reroute attempt has its result | full-stack (mobile) |
| `off_route` | C | product | on_duty | none | On-device detector decides the truck left the route | full-stack (mobile) |
| `navigation_ended` | C | product | on_duty | none | Guidance stops, for any reason (one per navigation) | full-stack (mobile) |
| `trip_completed` | C | product | on_duty | none | Arrival detected (geofence or driver confirms) | full-stack (mobile) |
| `report_created` | S | community | on_duty | h3_r6 | API saved a report (UC-06) | full-stack (API) |
| `report_voted` | S | community | on_duty | none | API handled Still there / Gone (UC-07) | full-stack (API) |
| `hazmat_warning_shown` | C | routing_safety | on_duty | h3_r5 | Hazmat/tunnel warning shown or spoken | full-stack (mobile), copy: UI/UX |
| `duty_changed` | S | fleet_admin | fleet_admin | none | Driver goes on/off duty, leaves, plan lapses | full-stack (API fleet) |
| `fleet_invite_accepted` | S | fleet_admin | fleet_admin | none | `POST /join` accepted after consent (BR-40) | full-stack (API fleet) |
| `subscription_changed` | S | billing | fleet_admin | none | Trial start, verified Stripe webhook, trial lapse | full-stack (API billing) |
| `app_crash` | C | reliability | never | none | Next launch after a fatal crash / ANR / OOM | DevOps (BR-10), emitted by mobile |

### Shared value sets

- **Truck profile bands** (never exact dimensions, because the exact combination can identify a truck):
  `height_band` `lt_3.5m · 3.5_3.99m · 4.0_4.19m · 4.2_4.39m · ge_4.4m` ·
  `weight_band` `lt_12t · 12_25.99t · 26_36.29t · 36.3_40t · gt_40t` ·
  `length_band` `lt_12m · 12_16.49m · 16.5_19.99m · 20_23m · gt_23m` · `axle_count` 2–12.
- **`hazmat_classes`:** array of UN/DOT classes 1–9, empty if none. **`tunnel_category`:** `B · C · D · E · null`.
- **`trigger`:** `initial · reroute · profile_change · destination_change`.
- **`report_type`** (BR-6): `crash · low_bridge · road_closed · hazard · police · scale_open · scale_closed · parking_full`.
- **`speed_band`:** `stationary · 1_29kph · 30_79kph · ge_80kph · unknown`.
- **`no_safe_route` reason codes:** `height_clearance · weight_limit · axle_weight_limit · length_limit · width_limit · hazmat_restriction · tunnel_category · truck_prohibited · blocked_road · no_route_found · unknown_critical_notice`.

### Event details

**`app_opened`** — v1
`launch_type` (`cold`/`warm`) · `is_first_open` (bool, first open after install, drives the install funnel) · `location_permission` (`always`/`while_using`/`denied`/`undetermined`) · `os_major` (string, optional).
`company_id` is always null: opening the app says nothing about duty.

**`route_requested`** — v1, server
`request_id` (UUID, joins to `no_safe_route` and `route_started`) · `trigger` · `outcome` (`ok`/`no_safe_route`/`error`) · `error_code` (when `error`: `provider_timeout`/`provider_5xx`/`provider_auth`/`invalid_request`/`rate_limited`/`internal`) · `provider` (`here`/`demo`) · `latency_ms` · `height_band` · `weight_band` · `length_band` · `axle_count` · `hazmat_classes` · `tunnel_category` · `distance_km` and `predicted_duration_s` (only when `ok`).
No origin, destination or route geometry.

**`no_safe_route`** — v1, server
`request_id` · `trigger` · `reason_codes` (1+ of the reason enum) · `provider_notice_codes` (HERE `notice.code` values, machine codes only, `^[A-Za-z][A-Za-z0-9]{1,63}$`) · `provider` · `hazmat_classes` · `tunnel_category` · `height_band` · `weight_band` · `origin_admin1` / `destination_admin1` (state, e.g. `US-NJ`, optional, for restriction-coverage-by-region).
**Never coordinates, road names, or provider free text.** Today `parseHereRoute` returns `notice.title ?? notice.code` as `reasons`. Titles are human-readable text and may name a road or place. Instrumentation must map `notice.code` to a `reason_code` through a lookup table in code, with `unknown_critical_notice` as the fallback. An unmapped code goes into `provider_notice_codes`, so we can see it and extend the table.

**`route_started`** — v1
`navigation_id` (UUID, new per navigation, ties together everything until `navigation_ended`) · `request_id` · `predicted_duration_s` (the ETA baseline for ETA MAE) · `distance_km` · `voice_enabled` · `battery_pct` · `is_charging`.

**`reroute`** — v1
`navigation_id` · `request_id` (absent when offline) · `reroute_index` (1, 2, …) · `cause` (`off_route`/`report_ahead`/`restriction_update`/`traffic`/`user_requested`) · `outcome` (`ok`/`no_safe_route`/`error`/`offline`) · `latency_ms` · `duration_delta_s` (new remaining ETA minus old, only when `ok`).

**`off_route`** — v1
`navigation_id` · `off_route_index` · `deviation_band` (`50_99m`/`100_249m`/`250_499m`/`ge_500m`) · `gps_accuracy_band` (`lt_20m`/`20_49m`/`ge_50m`/`unknown`) · `speed_band` · `auto_reroute` (bool).
One event per episode, debounced in the detector. A GPS-noise episode that is not followed by a `reroute` is still recorded: that is how we tune the detector.

**`navigation_ended`** — v1
`navigation_id` · `end_reason` (`arrived`/`user_ended`/`new_route`/`no_safe_route`/`app_terminated`/`gps_lost_timeout`) · `duration_s` · `distance_driven_km` (0.1 km) · `reroute_count` · `off_route_count` · `background_s` · `battery_start_pct` · `battery_end_pct` · `charging_during` (true if charging at any point).
Exactly one per `navigation_id`. If the OS killed the app, it is sent on next launch with `end_reason = app_terminated` and `ts` = the last time navigation was known to be running.

**`trip_completed`** — v1
`navigation_id` · `predicted_duration_s` (from `route_started`, the first ETA) · `actual_duration_s` (arrival minus `route_started.ts`) · `stopped_s` (time below 5 km/h, same idle rule as BR-43) · `distance_driven_km` · `reroute_count` · `arrival_detection` (`geofence`/`user_confirmed`).
Fires with `navigation_ended(arrived)`. **Naming note:** an analytics "trip" is one navigation to a destination. The fleet product's `Trip` object (BR-41/43) is a duty shift. Analytics calls those **shifts** (`shift_id` on `duty_changed`).

**`report_created`** — v1, server
`report_id` · `report_type` · `has_note` (the 140-character note never enters analytics) · `while_navigating` · `speed_band` (speed when tapped, a safety signal) · `h3_r6` (cell of the report, computed server-side from the stored pin) · `expires_after_s` · `client_platform`.

**`report_voted`** — v1, server
`report_id` · `report_type` · `vote` (`still_there`/`gone`) · `result` (`extended`/`recorded`/`removed`/`already_expired`/`rejected_own_report`/`rate_limited`) · `report_age_s`.

**`hazmat_warning_shown`** — v1
`warning_id` · `navigation_id` (when navigating) · `request_id` · `warning_type` (`tunnel_category_ahead`/`hazmat_restricted_road_ahead`/`restriction_data_uncertain`/`profile_hazmat_incomplete`/`report_hazmat_hazard`) · `surface` (`route_preview`/`navigating`) · `delivery` (`visual`/`voice`/`visual_and_voice`) · `hazmat_classes` · `tunnel_category` · `h3_r5` (optional, cell of the *restriction*, not of the driver, set at ingest).
Once per `warning_id` per navigation. Repeated reminders of the same warning are not new events.

**`duty_changed`** — v1, server
`shift_id` · `to_state` (`on_duty`/`off_duty`) · `change_source` (`driver_toggle`/`left_fleet`/`removed_by_owner`/`plan_lapsed`/`inactivity_timeout`) · `shift_duration_s` (on `off_duty` only).
No location. The `off_duty` event closes the shift: after it, no event carries this `company_id` until the next `on_duty`.

**`fleet_invite_accepted`** — v1, server
`invite_age_s` · `consent_text_version` (which consent text the driver agreed to, e.g. `2026-10-01`) · `role` (`driver`/`dispatcher`) · `seats_used_after` · `seat_limit` · `plan` · `sub_status`.
Never the invite code or the driver's display name. The consent record itself (who, when, which text) stays in the operational DB (`Member.consentAt`).

**`subscription_changed`** — v1, server
`change_type` (`trial_started`/`converted`/`upgraded`/`downgraded`/`seats_changed`/`payment_failed`/`payment_recovered`/`canceled`/`trial_expired`/`reactivated`) · `from_status` / `to_status` (`none`/`trialing`/`active`/`past_due`/`canceled`) · `from_plan` / `to_plan` (`starter`/`pro`/`enterprise`/null) · `seats` · `mrr_cents` · `currency` · `trial_started_at`.
Emitted only from a *verified* Stripe webhook (or the trial start/lapse job). Never Stripe customer or subscription ids.

**`app_crash`** — v1 (links to BR-10)
`crashed_session_id` (the session that crashed) · `crash_type` (`js_exception`/`native_crash`/`anr`/`oom`) · `sentry_event_id` (optional, 32 hex) · `last_screen` (enum of screen names) · `was_navigating` · `os_major`.
Sent on the next launch, because a crashing app can't send reliably. **No stack traces, breadcrumbs, device model, user data or location.** Sentry (BR-10) is the place to debug. This event exists only so crash-free sessions can be computed in the same warehouse, and to answer "did it crash while navigating?". `company_id` is always null.

## 5. Privacy rules

These are build-time rules. Most are enforced by the schema check or by the ingest endpoint, so they don't rely on people remembering them.

### 5.1 Location

| Rule | Enforced by |
|---|---|
| **No raw coordinates in analytics. Ever.** No lat/lng, polyline, route geometry, origin or destination, on any event. | Banned property names (CI) + closed schemas (CI + ingest) |
| Allowed precision: **H3 res 6** (~36 km²) for report location, **H3 res 5** (~250 km²) for hazmat warnings, **ISO 3166-2 state** for no-safe-route. Nothing finer, and only on the three events whose `x-location` says so. | `x-location` check (CI) |
| Cells are computed **on the server** from the operational record (report pin, restriction position). The app never sends a cell or a coordinate to the analytics endpoint. | Ingest |
| No location on `app_opened`, trip start or trip end: home and depot are the most identifying places. | Schema |
| Dashboards and exports that group by cell show a cell only when it has **≥ 10 distinct users** in the period. Smaller cells roll up to the res-4 parent or "other". | dbt mart + BI rule |
| Speeds and distances from the route are bands (`speed_band`, `deviation_band`), not raw values. | Schema |

0.1° grid as an alternative: it's simpler, but cells shrink with latitude and don't nest. H3 is recommended. Cells are written by the server, so switching later would only change ingest and the dbt seed.

### 5.2 Personal data

- **No PII in events:** no names, emails, phones, CDL/DOT/MC numbers, plates, VINs, fleet names, invite codes, Stripe ids, push tokens, advertising ids (IDFA/GAID) or device identifiers.
- **No free text:** report notes, HERE notice titles and error messages are excluded (`has_note` is the only trace of a note).
- **IP addresses** are used in memory at ingest only to drop obviously abusive traffic. They are never stored. Country comes from the user's account settings, not from IP.
- **Truck profile** only as bands plus hazmat classes and tunnel category (needed for safety KPIs).
- `user_id` and `company_id` are keyed HMAC pseudonyms. They are still personal data under GDPR/CCPA (re-identifiable with the key). The key and the internal-id mapping stay in the API. Warehouse users never get the key.

### 5.3 Fleet-scoped data and off-duty drivers

Each event declares `x-company-scope`:

| Scope | Meaning | Events |
|---|---|---|
| `never` | `company_id` is always null. | `app_opened`, `app_crash` |
| `on_duty` | The ingest sets `company_id` **only if** the driver had consented, was a member, **and was on duty at `ts`** (checked against the operational duty log, not the client's claim). Otherwise null. | routing, navigation, reports, hazmat warnings |
| `fleet_admin` | Fleet lifecycle facts the fleet already knows from its own dashboard: joining, duty start/stop, billing. No location, no driving behaviour. | `duty_changed`, `fleet_invite_accepted`, `subscription_changed` |

Rules:
1. The app never sends `company_id`. If it does, the ingest discards it.
2. **Off-duty activity never carries `company_id`.** Fleet-scoped marts (`marts.fleet_*`) filter `company_id IS NOT NULL` and are row-level-secured by `company_id`.
3. **No re-attribution.** Models must not join a null-`company_id` event to a company through `user_id` or membership tables. A dbt test fails the build if a `fleet_*` mart reads from an event row whose `company_id` is null.
4. A driver who leaves a fleet: past on-duty events keep that fleet's `company_id` until the retention for their family ends. New events get null.
5. Analytics events are never shown to fleet owners in v1. Fleet reports keep using the operational fleet tables (BR-43). If a fleet benchmark is ever built from analytics, it needs a separate security review.

### 5.4 Consent

| Consent | Governs | Default (proposal, owner to confirm) |
|---|---|---|
| **Product analytics** (in-app toggle under Settings → Privacy) | All events in this plan except billing | US/Canada: on, with opt-out at onboarding and in Settings. EU/UK and other opt-in regions: off until the driver agrees. |
| **Crash reports** (BR-10) | Sentry and `app_crash` | Separate toggle, same defaults |
| **Fleet sharing** (BR-40 consent screen) | Operational fleet tracking only | Off until the driver joins a fleet. **Does not imply analytics consent**, and analytics consent does not imply fleet sharing. |

Behaviour:
- If analytics consent is `denied`, the app sends **nothing** to `/v1/events` and drops its offline queue. The server also drops events for users whose stored consent is `denied` (server events included), except `subscription_changed`. That one is account/billing record-keeping about the company, emitted with `user_id = sys_stripe`.
- If consent is `unknown` (first launch, before the prompt), the app queues events locally and sends them only after consent is granted. If consent is denied, it drops the queue.
- The consent record (state, time, text version, region) is stored in the operational DB, not as an analytics event, so a denial is never itself tracked.
- Withdrawing consent stops collection immediately. Deleting past data is a separate action (5.6).

### 5.5 Retention per event family

Partitions are monthly by `received_at` and dropped by a scheduled job. Proposed periods, for the owner and legal to confirm (BR-45 legal review):

| Family | Events | Raw events | Aggregates (no `user_id`) | Why |
|---|---|---|---|---|
| `product` | app_opened, route_started, reroute, off_route, navigation_ended, trip_completed | **13 months** | indefinitely | Year-over-year retention and seasonality |
| `routing_safety` | route_requested, no_safe_route, hazmat_warning_shown | **25 months** | indefinitely | Safety investigations (BR-37) and restriction-data quality trend. Longest, so it needs explicit approval. |
| `community` | report_created, report_voted | **13 months** | indefinitely | Report accuracy models |
| `fleet_admin` | duty_changed, fleet_invite_accepted | **90 days** (= `FLEET_RETENTION_DAYS`) | 25 months, by company, no `user_id` | Matches the fleet breadcrumb promise in the consent text |
| `billing` | subscription_changed | **7 years** | indefinitely | Revenue records. No driver data inside. |
| `reliability` | app_crash | **90 days** | 25 months | Crash-free trend. Detail stays in Sentry under its own retention. |

Also: `on_duty`-scoped events in other families have their `company_id` **set to null at 90 days**, so the fleet link never outlives `FLEET_RETENTION_DAYS`. The `anon_ → u_` link table is kept 13 months.

### 5.6 Deletion on account removal

1. Account deletion (in app or by support) writes `user_id` (the pseudonym) to `analytics.deletion_requests`.
2. A daily job deletes every row with that `user_id` (and its linked `anon_` id) from the raw tables, the staging/marts tables and the parquet export. It records completion. **SLA: 30 days** (CCPA 45, GDPR one month).
3. Parquet files are rewritten per affected partition. Backups age out within 35 days, and deleted ids are re-applied on any restore.
4. Aggregates with no `user_id` and with ≥ 10 users per group are kept. They are not personal data.
5. The same request must clear Sentry (user id), HubSpot (marketing contact) and the operational DB. Those are owned by DevOps and full-stack, and listed here so nothing is missed.
6. A fleet org deletion nulls its `company_id` everywhere, except `subscription_changed` rows kept for the billing retention.

## 6. For security review

Flagged for `truckbeez-security-engineer`:

1. **HMAC pseudonyms are reversible by whoever holds `ANALYTICS_ID_KEY`.** Needed: secret-store placement, separate key per environment, no warehouse access to the key, and a rotation policy.
2. **Cell + timestamp re-identification.** An H3 res-6 report cell in a rural area plus a time could single out a driver. Mitigations: server-side cells only, k ≥ 10 for display, no origin/destination. Please confirm res 6 is acceptable for `report_created`, or require res 5.
3. **`on_duty` attribution relies on the ingest's duty-log lookup.** The ingest must look up duty state at `ts`, not at receipt, and default to null on any doubt (clock skew > 5 min, missing log). This needs an automated test (full-stack, QA) because it's the main "nothing from off-duty drivers" control.
4. **Analysts can see one `user_id` both on and off duty.** That is inherent to product analytics. Control: warehouse role access, the dbt no-re-attribution test, and no fleet-facing output from analytics.
5. **HERE notice titles.** Free text must never reach the event or logs. Map codes to reasons (section 4).
6. **Ingest endpoint abuse.** `/v1/events` needs auth (the driver's session), size limits (≤ 100 events and ≤ 100 KB per batch), rate limits (Redis), and rejection of schemas that don't validate. It is an attack surface for data poisoning.
7. **Employee-monitoring rules.** Even pseudonymized, fleet-scoped analytics may fall under state monitoring-notice laws (e.g. NY Civil Rights Law §52-c). This belongs in BR-45's legal review.
8. **Consent defaults by region** (5.4) need a legal decision before the US-only launch assumption is relied on.

## 7. KPI glossary

Global filters for every KPI unless stated: `env = 'prod'`, internal/test accounts excluded (`dim_user.is_internal = false`), events deduped by `event_id`. Days are UTC calendar days. Rates are ratios of sums, not averages of per-user rates.

| KPI | Definition and formula | Grain | Filters / notes | Source events |
|---|---|---|---|---|
| **Route completion rate** | `count(distinct navigation_id where navigation_ended.end_reason = 'arrived') / count(distinct navigation_id from route_started)` | navigation; reported daily / weekly by platform and app_version | Exclude navigations with `end_reason = 'new_route'` from **both** sides (the driver replaced the route, it was not abandoned). Exclude navigations with `duration_s < 120`. Window: by `route_started.ts` date; allow 48 h for `navigation_ended` to arrive. | route_started, navigation_ended |
| **Reroute rate** | Primary: `count(reroute where outcome != 'offline') / sum(navigation_ended.distance_driven_km) × 100` = **reroutes per 100 km**. Secondary: share of navigations with `reroute_count ≥ 1`. | navigation → day | Split by `cause`. Off-route reroutes measure driver/detector behaviour. `restriction_update` reroutes are the safety-relevant ones. | reroute, navigation_ended |
| **No-safe-route rate** | `count(distinct request_id in no_safe_route where trigger = 'initial') / count(distinct request_id in route_requested where trigger = 'initial' and outcome in ('ok','no_safe_route'))` | route request → day | `error` outcomes are excluded (tracked as routing error rate). Also report **per user-day** (has ≥ 1 no-safe-route ÷ users with ≥ 1 request), so retry loops don't inflate it. Break down by `reason_codes` (unnest), hazmat vs non-hazmat, `origin_admin1`. Reroute-triggered no-safe-routes are a separate, safety-critical count (target investigated: 100%). | route_requested, no_safe_route |
| **ETA MAE** | `avg(abs(actual_duration_s − predicted_duration_s)) / 60` in **minutes**. Also report MAPE = `avg(abs(actual − predicted) / predicted)` and signed mean error (bias). | trip → week | `trip_completed` only. `predicted_duration_s ≥ 300`. Primary cut excludes trips with `stopped_s > 900` (a 30-min fuel stop is not an ETA error), and reports that share. Cut by trip length bucket (< 1 h, 1–4 h, > 4 h). | trip_completed |
| **Crash-free sessions** | `1 − count(distinct app_crash.crashed_session_id) / count(distinct session_id from app_opened)` | session → day, by platform and app_version | Sessions dated by their `app_opened.ts`. Sentry's own crash-free figure (BR-10) is the reference: alert if the two differ by > 0.5 pp for a release (means events are being lost). Also report **crash-free navigations** (crashes with `was_navigating` ÷ navigations), the one that matters for safety. | app_opened, app_crash |
| **D1 / D7 / D30 retention** | Cohort = users by the date of their first `app_opened` (`anon_` linked to `u_`). Retained on day N if the user has any `app_opened` on cohort_date + N (exact day). `retention_dN = retained users / cohort size`. | user cohort (day) → reported weekly | A cohort is reported only once it is mature (N days old + 2 days). Also track **navigation retention**: same, but "active" = `route_started`. That's the meaningful one for a nav app. | app_opened, route_started |
| **Trial → paid conversion** | Cohort = fleets with `subscription_changed.change_type = 'trial_started'` in the period. `converted` = cohort fleets with a `to_status = 'active'` event within **trial_started_at + 21 days** (14-day trial + 7-day grace). Rate = converted / cohort. | company cohort (week or month of trial start) | Reported only for cohorts at least 21 days old. Enterprise excluded (sales-led). Deleted test orgs excluded. | subscription_changed |
| **Active fleets** | Count of distinct `company_id` with status `trialing` or `active` at end of day **and** ≥ 1 `duty_changed(to_state='on_duty')` in the trailing 7 days. **Paying fleets** = same, status `active` only. | company → day | Status = latest `subscription_changed.to_status` at or before end of day. | subscription_changed, duty_changed |
| **Seats (billed / active)** | Billed seats = sum of latest `subscription_changed.seats` across paying fleets at end of day. Active seats = distinct drivers (`user_id`) with ≥ 1 on-duty shift in the trailing 7 days, in paying fleets. **Seat utilisation** = active ÷ billed. | company → day | Active-seat counts use fleet_admin events, which are only kept 90 days. Daily snapshots are stored in `marts.fleet_daily` (no `user_id`) for longer trends. | subscription_changed, duty_changed |
| **MRR** | Sum of latest `mrr_cents` per company at end of month ÷ 100. | company → month | Status `active` or `past_due`. | subscription_changed |
| **Battery %/hour (navigation)** | Per navigation: `(battery_start_pct − battery_end_pct) / (duration_s / 3600)`. Fleet-wide: `sum(start − end) / sum(duration_s / 3600)`. Report the ratio of sums and p50 / p90 per navigation. **Budget: ≤ 7 %/h.** | navigation → week, by platform, OS major and app_version | Only `charging_during = false`, both battery readings not null, `duration_s ≥ 900`, and `background_s / duration_s ≤ 0.5` (screen-on navigation; background is reported separately). Battery level readings are coarse on some devices, so 15+ minutes is the minimum sample. | navigation_ended |

Supporting definitions:
- **DAU / WAU / MAU drivers:** distinct `user_id` with `app_opened` in the day / 7 days / 30 days. `u_` users only (signed in).
- **Report accuracy (proxy):** for each report, `still_there` votes ÷ (`still_there` + `gone`) votes, over reports with ≥ 2 votes. A labelling spec for the AI architect will follow.
- **Restriction-violation incidents:** not derivable from events. Comes from Jira (BR-37 critical routing bugs). Target zero.

## 8. Pipeline recommendation

**Recommendation for MVP: first-party, in the stack we already run.** No third-party analytics SDK in the app.

```
 Driver app ──batch──▶ POST /v1/events (Express API) ──▶ Postgres  analytics.events_raw   ──nightly──▶ object storage (parquet, dt=/event_name=)
                         │ auth, validate (events.schema.json),       (separate schema & role,          │
 API (server events) ────┘ set user_id/company_id, drop IP,           monthly partitions, jsonb)        └─▶ (later) BigQuery external tables
                           dedupe event_id, consent check                       │
                                                                                ▼
                                                     dbt-postgres: staging → intermediate → marts ──▶ Metabase (KPI dashboards)
```

- **Client:** a ~150-line wrapper in the app (no SDK). Events queue in local storage (max 1,000 events / 7 days, oldest dropped). The queue flushes every 60 s while in foreground, when backgrounded, and with existing API calls. **It never wakes the radio on its own while navigating**, to protect the 7 %/h battery budget. Batches are gzipped and hold up to 100 events.
- **Ingest:** a route on the existing API. It validates each event against `events.schema.json` (a compiled validator, generated at build time from the same file) and returns 207-style per-event results. Invalid events go to `analytics.events_rejected` with the error, not the payload, for monitoring.
- **Storage:** the same managed Postgres instance, a separate `analytics` schema with its own write-only ingest role and read-only analyst role. The table is partitioned monthly by `received_at`, which makes retention a cheap `DROP PARTITION`. A **read replica** serves dbt and BI as soon as one exists, so analytics queries never touch the routing/fleet primary.
- **Transforms:** dbt-postgres, `raw → staging (typed, deduped, per event) → intermediate (navigations, sessions, shifts) → marts (kpi_daily, fleet_daily, retention_cohorts)`, with unique / not_null / accepted_values tests generated from the JSON enums, plus the no-re-attribution test (5.3).
- **Orchestration:** cron jobs (GitHub Actions schedule or a container cron) for dbt, the parquet export, retention drops and deletions. All jobs are idempotent per partition and can be backfilled by date. Failures alert in the same channel as BR-10. Move to Dagster only if this grows past ~10 jobs.
- **Cost:** about 1,000 DAU × ~60 events/day ≈ 1.8 M events/month ≈ 2–3 GB/month in Postgres, which the existing instance absorbs. Metabase OSS runs in one container. Parquet costs cents per month. **Marginal cost: roughly $0–50/month.**
- **When to graduate:** past ~50 M events/month, or when analytics queries slow the replica, point BigQuery at the parquet export and move the dbt target. The schema doesn't change.

**Why not PostHog / Amplitude / Mixpanel for MVP?** They're quicker to start and have free tiers, but they would hold hazmat-route and fleet data at a third party (needs a DPA, region choice, and a security review of a mobile SDK). They also put a second SDK on the battery budget and make `company_id` derivation and deletion harder to control. Revisit for funnels and session replay later, fed from our ingest, not from an app SDK.

**Marketing (installs, HubSpot):** installs come from App Store Connect / Google Play Console, and `is_first_open` gives activation. Recommendation: **no mobile measurement partner SDK in MVP**. HubSpot gets only signed-up users who opted into marketing email, from the account service, and never analytics events or location. UTM-tagged store links measure campaigns at the store level.

## 9. Hand-offs

| To | What they need to do |
|---|---|
| `truckbeez-fullstack-engineer` | Build `POST /v1/events` (validation from `events.schema.json`, server-side `user_id`/`company_id`, duty-log lookup at `ts`, consent check, IP drop, dedupe). Emit the server events. Map HERE `notice.code` → `reason_codes`. Build the app wrapper (queue, flush rules, `session_id`, battery fields, `navigation_ended` on next launch after a kill). |
| `truckbeez-security-engineer` | Review section 6 and the retention table. Sign off on H3 res 6/5 and the consent defaults. |
| `truckbeez-devops-specialist` | `ANALYTICS_ID_KEY` per environment in the secret store. `analytics` schema and roles. Read replica. Cron jobs (dbt, export, retention, deletion) with alerting. Make `data-schema` a required check on PRs touching `docs/data/**`. |
| `truckbeez-qa-automation-engineer` | API tests: off-duty event → `company_id` null. Consent denied → nothing stored. Banned fields rejected. Appium: battery/session fields present after a 15-minute navigation. |
| `truckbeez-ai-agent-architect` | Datasets: `trip_completed` (ETA model eval), `report_created` + `report_voted` (report validation labels), `no_safe_route` reasons. Labelling spec to follow from data once events flow. |

## 10. Open questions for the owner

**Decisions needed now** (they block instrumentation):
1. **Where events go:** first-party Postgres pipeline (recommended, ~$0–50/month, data stays in our stack) or a hosted tool such as PostHog Cloud (faster dashboards, third party holds driver/hazmat data).
2. **Consent defaults:** product analytics on-with-opt-out in the US/Canada and opt-in elsewhere (recommended), or opt-in everywhere (cleaner legally, much less data). Crash reporting as a separate toggle.
3. **Retention periods:** approve section 5.5, in particular **25 months for routing-safety events** (longer than the 90-day fleet promise, justified by safety investigations) and **90 days for fleet_admin**.

Can wait:
4. H3 res 6 for report cells, or res 5 everywhere (security input).
5. Fleet benchmarking from analytics ("your fleet vs the average"): wanted in a later plan? It needs its own privacy review.
6. Is a mobile measurement partner (AppsFlyer/Adjust) for paid install campaigns expected? It changes the consent and SDK story.
7. Rename the fleet product's "Trip" (a duty shift) to "Shift" in API/UI, to match analytics and avoid confusing trip reports with navigation trips?
8. Retention "active" definition for the investor/board view: app opened, or route started?
