# TruckBeez — hazard reporting slice (excerpt from SDLC docs 03, 06, 07, 09)

## Requirements (03)
| ID | Requirement | Priority |
| --- | --- | --- |
| FR-M-08 | Report a hazard in <= 2 taps while driving (police, accident, closure, debris, weigh_open, weigh_closed) | Must |
| FR-M-09 | Show hazards on and near the route in real time; confirm or dismiss existing reports | Must |
| FR-A-03 | Expire hazard reports after 60 minutes unless confirmed by other drivers (each confirmation extends expiry by 30 min) | Must |
| NFR-07 | Auth required on every endpoint; TLS; validate all input | Must |

## API (06) — base /v1, JWT bearer auth, error envelope {"error":{"code","message","requestId"}}
| Method | Path | Purpose | Roles | Req |
| --- | --- | --- | --- | --- |
| POST | /hazards | Report a hazard: body {type, lat, lng} | driver | FR-M-08 |
| GET | /hazards?bbox=minLng,minLat,maxLng,maxLat | Active hazards in a bounding box | driver | FR-M-09 |
| POST | /hazards/{id}/votes | Confirm or dismiss: body {vote: "confirm" or "dismiss"} | driver | FR-M-09 |

Errors: 400 VALIDATION_FAILED, 401 TOKEN_EXPIRED / UNAUTHENTICATED, 404 NOT_FOUND, 409 ALREADY_VOTED, 429 RATE_LIMITED.
Socket.IO /realtime: hazard:new (server -> app, only to drivers whose current route is within 2 km), hazard:expired {id}.

## Database (07)
hazards: id uuid, type text, point geography(Point), reported_by uuid, status text ('active','expired','removed'), confirmations int, expires_at timestamptz. Index GIST(point) WHERE status='active'; index (expires_at).
hazard_votes: hazard_id, user_id, vote, created_at — one vote per user per hazard.

## Test cases (09)
| ID | Title | Req |
| --- | --- | --- |
| TC-M-010 | Report hazard in 2 taps | FR-M-08 |
| TC-M-012 | Receive nearby hazard | FR-M-09 |
| TC-A-002 | Auth required | NFR-07 |
| TC-A-003 | Hazard expiry after 60 min unconfirmed | FR-A-03 |
