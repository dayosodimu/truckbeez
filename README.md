# TruckBeez

A Waze-style navigation app for truck drivers: truck-safe routing plus real-time road reports from other drivers.

This is a starter monorepo:

```
apps/
  mobile/   Expo (React Native + TypeScript) driver app
  server/   Node + Express + Socket.IO API (routing proxy + live reports)
```

## What's included

- **Truck profile** (height, width, length, weight, axles, hazmat) sent with every route request.
- **Truck routing** through a provider adapter. HERE Routing v8 (`transportMode=truck`) is wired up; with no API key the server returns a straight-line demo route so the app still runs.
- **Crowdsourced reports**: accident, police, closure, hazard, low clearance, weigh station open/closed, truck parking full. Reports expire automatically and other drivers can confirm them to keep them alive.
- **Live updates** over Socket.IO, so new reports appear on every nearby driver's map instantly.
- **Driver-safe UI**: large tap targets, one-tap reporting, high-contrast night palette.
- **TruckBeez Fleet (B2B subscription)**: logistics owners invite drivers with a one-time code, see on-duty drivers on a live map, and get trip reports (distance, driving/idle time, off-route events, road reports filed), route replay and CSV export on Fleet Pro. Drivers consent when they join and are only shared while **on duty**. Billing runs through Stripe Checkout; with no Stripe key the server uses demo billing.

## Run the server

```bash
cd apps/server
cp .env.example .env        # add HERE_API_KEY for real truck routing
npm install
npm run dev                 # http://localhost:4000
```

## Run the mobile app

```bash
cd apps/mobile
npm install
npx expo install --fix      # aligns native package versions to your Expo SDK
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.20:4000
npx expo start
```

Open it in Expo Go on a phone. Long-press the map to set a destination; tap the hexagon to report something.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/route` | `{ origin, destination, profile }` → truck-safe route |
| GET | `/api/reports?lat=&lng=&radiusKm=` | Active reports nearby |
| POST | `/api/reports` | Create a report |
| POST | `/api/reports/:id/confirm` | Confirm a report (extends its life) |

Socket events: `report:new`, `report:updated`.

### Fleet API (`/api/fleet`)

Every call except `/plans` needs a signed-in user. In development the app sends `x-user-id` and `x-user-name`; this stand-in is refused in production until real accounts land.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/plans` | anyone | Plans, driver limits, features |
| GET | `/me` | any user | Membership, fleet, plan, whether it's active |
| POST | `/orgs` | new owner | `{ name, plan }` → creates fleet with a 14-day trial |
| POST | `/invites` | owner | One-time 6-character code, valid 7 days |
| POST | `/join` | driver | `{ code, consent: true }` |
| POST | `/leave` | driver | Leave; sharing stops immediately |
| POST | `/duty` | driver | `{ onDuty }` → starts/ends a trip |
| POST | `/positions` | on-duty driver | `{ lat, lng, speedKph, heading?, offRoute? }` (app sends every 15 s) |
| GET | `/drivers` | owner, dispatcher | Drivers with status and live position (on duty only) |
| GET | `/drivers/:id/trips?from&to&path=true` | owner, dispatcher | Trips; `path` included on Fleet Pro |
| GET | `/reports/summary?from&to` | owner, dispatcher | Per-driver totals (max 92 days) |
| GET | `/reports/export.csv?from&to` | owner, dispatcher | CSV (Fleet Pro) |
| POST | `/billing/checkout` | owner | `{ seats }` → Stripe Checkout URL |
| POST | `/billing/webhook` | Stripe | Subscription status updates (signature verified) |

Fleet socket: managers emit `fleet:watch` with their user id and then receive `fleet:position` and `fleet:status` for their fleet only.

## Trying Fleet locally

Use two phones (each install gets its own dev identity): on phone A tap **Fleet → I manage a fleet**, start a trial and **Invite a driver**; on phone B tap **Fleet → Join my company's fleet**, enter the code, accept, then tap the **Off duty** chip on the map to go on duty. Phone A's dashboard shows phone B live.

## Next steps

1. Replace the in-memory report store (`apps/server/src/lib/store.ts`) with Postgres + PostGIS.
2. Add driver accounts (auth) and tie reports to users for moderation.
3. Add turn-by-turn voice guidance using the route `instructions` (e.g. `expo-speech`).
4. Add a truck stop / parking points layer.
5. Replace the Fleet dev identity headers with real accounts, and move fleet data to Postgres (trips and breadcrumbs kept 90 days).
6. Background location so on-duty sharing continues with the screen off (`expo-task-manager`).
7. Verify HERE request parameters against current HERE docs before production, and confirm licensing for your use.

## Project setup

- **Shared project context and rules:** [`CLAUDE.md`](CLAUDE.md)
- **AI agent team:** [`docs/agents.md`](docs/agents.md). Role-specific Claude Code agents live in [`.claude/agents/`](.claude/agents/).
