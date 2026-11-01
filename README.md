# TruckBeez

A Waze-style navigation and routing app built for truck drivers, with truck-legal routing (height, weight, length, hazmat), community hazard reports, truck POIs, and a B2B subscription for fleet owners to track and report on their drivers' navigation.

## Repository layout

```
truckbeez/
├── apps/
│   ├── api/        # Node + Express + Socket.IO: POST /api/route (HERE Routing v8, truck mode), live updates
│   └── mobile/     # Expo (React Native + TypeScript) driver app
├── packages/
│   └── shared/     # API contracts shared by app and API: truck profile, route request/response, messages
├── CLAUDE.md       # shared product context and rules
└── docs/agents.md  # AI agent team guide
```

## Getting started

Requires Node 22 (`nvm use`).

```bash
npm install          # installs every workspace
npm run typecheck    # all workspaces
npm test             # all workspaces
```

### API

```bash
cp apps/api/.env.example apps/api/.env   # add HERE_API_KEY for real truck routing
npm run dev:api                          # http://localhost:4000
```

Without `HERE_API_KEY` the API serves a straight-line **demo route** that ignores truck restrictions, for development only. It refuses to start with `NODE_ENV=production` and no key.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Status and active routing provider |
| `POST /api/route` | Truck-safe route. `200` route · `400` invalid request · `422` no truck-safe route · `502` routing provider error |
| Socket.IO `health:check` | Realtime connectivity check |

A route that HERE flags with a critical restriction notice is never returned: the API answers `422 NO_SAFE_ROUTE` instead (UC-04).

### Mobile app

```bash
npm run dev:mobile   # Expo dev server; open in Expo Go or a dev build
```

Set `EXPO_PUBLIC_API_URL` to reach the API from a device (the Android emulator uses `http://10.0.2.2:4000`). Every interactive element has a `testID` for the Appium suite.

## Project setup
- **Shared project context and rules:** [`CLAUDE.md`](CLAUDE.md)
- **AI agent team:** [`docs/agents.md`](docs/agents.md). Role-specific Claude Code agents live in [`.claude/agents/`](.claude/agents/).
- **Planning:** Asana (Wave Bees) · **Dev & bugs:** Jira project `BR`
