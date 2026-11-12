# TruckBeez MCP server

An MCP server with developer and QA tools for TruckBeez: hours-of-service math, HERE truck and hazmat routing, the navigation battery budget, and health checks across the deployed environments.

## Setup

```bash
cd tools/mcp-server
pip install -r requirements.txt     # mcp>=2.3 (Python 3.10+)
python tests/test_server.py         # end-to-end test against a fake API, no internet needed
```

The repo-root `.mcp.json` registers the server with Claude Code. Export these in the shell you start Claude from:

```bash
export HERE_API_KEY="..."                                   # optional: enables live routing
export TRUCKBEEZ_ENVS='{"staging":"https://staging.example.com","preprod":"https://preprod.example.com","production":"https://api.example.com"}'
```

## Tools

| Tool | Does |
|---|---|
| `hos_status` | Drive time left right now and which FMCSA limit binds first (11 h, 14 h, 30-minute break, 60/70 h) |
| `plan_hos_stops` | Required 30-minute breaks, 10-hour resets and 34-hour restarts for an N-hour trip |
| `truck_route` | HERE Routing v8 truck request: lbs/ft converted to kg/cm, DOT hazmat classes mapped to `shippedHazardousGoods`, tunnel category. Called live when `HERE_API_KEY` is set; returns miles, hours, restriction violations and the HOS stop plan |
| `battery_budget_check` | Least-squares drain rate from device readings (e.g. Appium + `adb dumpsys battery`) vs the 7%/hour budget |
| `environment_health` | `/healthz` and `/version` per environment through the edge (port 8080). Flags an env serving another env's build. Reports whether Socket.IO answers yet |
| `docker_containers` | `docker ps` filtered to the `truckbeez*` compose projects |

Resource: `truckbeez://hos-rules`

## Notes

- HOS uses the property-carrying limits in 49 CFR 395.3. Split-sleeper, adverse-driving and short-haul exceptions are not modelled.
- Per CLAUDE.md, hazmat correctness beats route speed. `truck_route` surfaces HERE's critical notices as `restriction_violations`, and unknown hazmat classes are returned rather than silently dropped. Check `HAZMAT_MAP` against HERE's docs before relying on it for live hazmat loads.
- The unit environment is a test-only container with no network, so `environment_health` covers staging, preprod and production.
- A Trimble PC*MILER adapter can sit beside `truck_route` when that spike goes ahead.
