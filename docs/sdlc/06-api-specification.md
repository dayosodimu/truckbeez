# 06 API Specification

The API is versioned REST at `https://api.truckbeez.com/v1` plus a Socket.IO namespace at `/realtime`; both use the same JWT. The OpenAPI 3.1 file in the `truckbeez` repo (`/docs/openapi.yaml`) is the contract of record, and this document summarises it.

## Conventions

- JSON only; `camelCase` fields; ISO 8601 UTC timestamps; coordinates as `{lat, lng}` (WGS84).
- Auth: `Authorization: Bearer <accessToken>`; refresh via `POST /v1/auth/refresh`.
- Pagination: cursor based, `?limit=50&cursor=<opaque>`; response carries `nextCursor`.
- Idempotency: `Idempotency-Key` header required on POSTs that create payments or reports.
- Rate limits: 120 requests/min per user, 20 route calculations/min per user; `429` with `Retry-After`.
- Every response carries `X-Request-Id` for tracing.

## REST endpoints

| Method | Path | Purpose | Roles | Req |
| --- | --- | --- | --- | --- |
| POST | /auth/otp/request | Send email OTP | Public | FR-M-01 |
| POST | /auth/otp/verify | Exchange OTP for tokens | Public | FR-M-01 |
| POST | /auth/oauth/{provider} | Apple / Google sign-in | Public | FR-M-01 |
| POST | /auth/refresh | Rotate tokens | Any | FR-M-01 |
| GET / PUT | /me | Read / update profile | Any | FR-M-01 |
| DELETE | /me | Delete account and data | Any | FR-M-15 |
| GET / POST / PUT | /trucks, /trucks/{id} | Truck profiles | driver | FR-M-02 |
| POST | /routes | Calculate truck/hazmat routes | driver | FR-M-05 |
| POST | /routes/{id}/reroute | Reroute from current position | driver | FR-M-07 |
| GET | /places/search | Geocode / POI search | driver | FR-M-04, FR-M-10 |
| GET | /hazards?bbox= | Hazards in a bounding box | driver | FR-M-09 |
| POST | /hazards | Report a hazard | driver | FR-M-08 |
| POST | /hazards/{id}/votes | Confirm or dismiss | driver | FR-M-09 |
| GET | /trips, /trips/{id} | Trip history | driver, fleet roles | FR-M-13, FR-W-04 |
| POST | /fleets | Create fleet | fleet_owner | FR-W-01 |
| POST | /fleets/{id}/invites | Invite drivers | fleet_owner, dispatcher | FR-W-01 |
| POST | /invites/{token}/accept | Driver accepts invite (consent) | driver | FR-M-11 |
| PUT | /me/duty | On / off duty | driver | FR-M-11 |
| GET | /fleets/{id}/drivers/live | Latest positions | fleet roles | FR-W-03 |
| POST | /fleets/{id}/reports | Generate CSV/PDF export (async) | fleet roles | FR-W-04 |
| GET / POST | /fleets/{id}/geofences | Geofences | fleet_owner, dispatcher | FR-W-06 |
| POST | /billing/checkout | Start Stripe checkout | fleet_owner | FR-W-02 |
| POST | /webhooks/stripe | Billing events | Stripe signature | FR-W-09 |
| GET / PATCH | /admin/hazards, /admin/users/{id} | Moderation | admin | FR-W-08 |

## Example: calculate a route

```
POST /v1/routes
{
  "origin": {"lat": 40.7128, "lng": -74.0060},
  "destination": {"lat": 39.9526, "lng": -75.1652},
  "truckId": "trk_8f2c",
  "hazmat": {"classes": [3], "tunnelCategory": "D"},
  "alternatives": 3,
  "avoid": ["tolls"]
}

200 OK
{
  "routes": [{
    "id": "rte_91ab",
    "distanceMeters": 152340,
    "durationSeconds": 6420,
    "tollsUsd": 0,
    "restrictionsApplied": ["height", "hazmat_tunnel_D"],
    "polyline": "...",
    "instructions": [ ... ]
  }],
  "provider": "here"
}
```

## Socket.IO events (/realtime)

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| location:update | app → server | {lat, lng, heading, speedMps, accuracyM, ts} | Every 5 s on duty; dropped if off duty |
| hazard:report | app → server | {type, lat, lng} | Same rules as POST /hazards |
| hazard:new | server → app | Hazard object | Only hazards within 2 km of the active route |
| hazard:expired | server → app | {id} | Remove from map |
| fleet:position | server → web | {driverId, lat, lng, heading, ts, status} | Fleet room only |
| fleet:alert | server → web | {type, driverId, details} | Off-route, hazmat breach, geofence |

## Error model

```
{ "error": { "code": "ROUTE_NOT_FOUND", "message": "No legal route for this truck profile", "requestId": "req_7a1" } }
```

| HTTP | Code examples | Client behaviour |
| --- | --- | --- |
| 400 | VALIDATION_FAILED | Show field errors |
| 401 | TOKEN_EXPIRED | Refresh once, then sign out |
| 403 | FORBIDDEN, PLAN_REQUIRED | Show upgrade or access message |
| 404 | NOT_FOUND, ROUTE_NOT_FOUND | Explain and offer to edit truck profile |
| 409 | ALREADY_IN_FLEET | Ask driver to leave current fleet |
| 429 | RATE_LIMITED | Back off per Retry-After |
| 502 / 503 | ROUTING_PROVIDER_DOWN | Keep last route, retry with backoff |

## API testing

Contract tests run the OpenAPI file against the API in CI; a Postman collection per environment covers smoke and regression (see document 08).

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
