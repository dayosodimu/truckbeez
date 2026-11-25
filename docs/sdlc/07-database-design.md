# 07 Database Design

PostgreSQL 16 with PostGIS is the system of record; Redis holds only data that can be rebuilt (latest positions, route cache, queues). Location points are the largest table and are partitioned by month so retention purges are cheap.

## Entities

| Table | Key columns | Notes |
| --- | --- | --- |
| users | id (uuid), email, phone, name, role, status, created_at, deleted_at | Soft delete, hard purge after 30 days |
| auth_identities | id, user_id → users, provider, provider_sub | Apple / Google / email |
| refresh_tokens | id, user_id, token_hash, expires_at, revoked_at | Rotating |
| trucks | id, user_id, name, height_cm, weight_kg, length_cm, width_cm, axles, trailer_type | Metric storage, UI converts |
| hazmat_profiles | id, truck_id, classes int[], tunnel_category | Per trip override allowed |
| fleets | id, name, owner_id → users, plan, seats, stripe_customer_id, status |  |
| fleet_members | fleet_id, user_id, role, consent_at, joined_at, left_at | Unique active membership per user (BRULE-01) |
| invites | id, fleet_id, email/phone, token_hash, expires_at, accepted_at |  |
| duty_sessions | id, user_id, fleet_id, started_at, ended_at | Tracking only inside a session (BRULE-02) |
| trips | id, user_id, truck_id, route_id, origin geography, destination geography, started_at, ended_at, distance_m |  |
| routes | id, provider, request_hash, geometry geography(LineString), duration_s, distance_m, restrictions jsonb |  |
| location_points | id, user_id, trip_id, point geography(Point), speed_mps, heading, recorded_at | Partitioned monthly |
| hazards | id, type, point geography(Point), reported_by, status, confirmations, expires_at | Expire per BRULE-03 |
| hazard_votes | hazard_id, user_id, vote, created_at | One vote per user |
| geofences | id, fleet_id, name, area geography(Polygon) | Pro plan |
| alerts | id, fleet_id, driver_id, type, payload jsonb, created_at, acknowledged_at |  |
| subscriptions | id, fleet_id, stripe_subscription_id, plan, status, current_period_end |  |
| audit_log | id, actor_id, action, entity, entity_id, ip, created_at | Admin + PII access |

## Relationships

- A user has many trucks, trips and duty sessions; a user belongs to at most one active fleet.
- A fleet has many members, invites, geofences, alerts and one active subscription.
- A trip has one route and many location points; a hazard has many votes.

## Indexes

| Table | Index | Why |
| --- | --- | --- |
| location_points | (user_id, recorded_at DESC) | Trip replay, reports |
| location_points | GIST (point) | Geofence checks |
| hazards | GIST (point) WHERE status = 'active' | Hazards near a route |
| hazards | (expires_at) | Expiry job |
| fleet_members | UNIQUE (user_id) WHERE left_at IS NULL | Enforce one fleet |
| routes | (request_hash) | Cache lookups |

## Retention

| Data | Retention | Mechanism |
| --- | --- | --- |
| Location points (free driver) | 30 days | Drop monthly partitions |
| Location points (fleet) | 90 days Starter, 1 year Pro, contract for Enterprise | Worker purge per fleet plan |
| Hazards | 30 days after expiry | Worker purge |
| Audit log | 2 years | Archive to S3 |
| Deleted accounts | Purge within 30 days | Worker job |

## Redis keys

| Key | Value | TTL |
| --- | --- | --- |
| pos:{userId} | Latest position JSON | 2 min |
| route:{hash} | Normalised route response | Per provider licence, default 15 min |
| rl:{userId}:{bucket} | Rate-limit counter | 60 s |
| bull:* | Job queues | Managed by BullMQ |

## Migrations and backups

- Schema changes through versioned migrations (Prisma Migrate or Knex [Assumption]) reviewed in PRs; never edit the database by hand.
- RDS automated backups with 14-day point-in-time recovery; weekly restore test in pre-production.
- Test data: synthetic users and routes seeded per environment; no production PII outside production.

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
