# TruckBeez

A Waze-style navigation and routing app built for truck drivers, with truck-legal routing (height, weight, length, hazmat), community hazard reports, truck POIs, and a B2B subscription for fleet owners to track and report on their drivers' navigation.

## Repository layout (ADR-0003)
| Path | What |
|---|---|
| `services/api` | The only API: Express 5 + Socket.IO, truck-safe routing (`POST /api/route`) |
| `packages/shared` | `@truckbeez/shared`: zod contracts (truck profile, route request/response, error codes) used by the API and the app |
| `apps/mobile` | The driver app (Expo), from ADR-0003 step E |

```bash
npm ci --ignore-scripts   # one lockfile for every workspace
npm test                  # builds @truckbeez/shared, then runs each workspace's tests
```

## Project setup
- **Shared project context and rules:** [`CLAUDE.md`](CLAUDE.md)
- **Container environments (unit, staging, pre-production, production):** [`docs/deployment.md`](docs/deployment.md)
- **AI agent team:** [`docs/agents.md`](docs/agents.md). Role-specific Claude Code agents live in [`.claude/agents/`](.claude/agents/).
