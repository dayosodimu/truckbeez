"""End-to-end test for the TruckBeez MCP server.

Launches the server over stdio, connects as an MCP client and calls every tool
against a local fake TruckBeez API (no internet needed).

Run from tools/mcp-server:  python tests/test_server.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from mcp.client import Client
from mcp.client.stdio import StdioServerParameters

SERVER = Path(__file__).resolve().parent.parent / "server.py"
ROUTES = {
    "/healthz": json.dumps({"status": "ok"}),
    "/version": json.dumps({"service": "api", "version": "0.4.2", "env": "staging"}),
}


class FakeApi(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path not in ROUTES:
            self.send_response(404); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(ROUTES[path].encode())

    def log_message(self, *a): pass


def result(res) -> dict:
    sc = res.structured_content
    if sc is not None:
        return sc.get("result", sc) if isinstance(sc, dict) else sc
    return json.loads(res.content[0].text)


async def main() -> int:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeApi)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}"
    env = {"PATH": os.environ["PATH"], "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost",
           "TRUCKBEEZ_ENVS": json.dumps({"staging": base, "preprod": base, "production": "http://127.0.0.1:9"})}
    failures: list[str] = []

    def expect(cond: bool, msg: str) -> None:
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond:
            failures.append(msg)

    calls = [
        ("hos_status", {"driving_hours_today": 7.5, "on_duty_window_hours_elapsed": 9,
                        "driving_since_last_break_hours": 7.5, "cycle_hours_used": 50}),
        ("hos_status", {"driving_hours_today": 10, "on_duty_window_hours_elapsed": 13.8,
                        "driving_since_last_break_hours": 2, "cycle_hours_used": 50}),
        ("hos_status", {"driving_hours_today": 4, "on_duty_window_hours_elapsed": 5,
                        "driving_since_last_break_hours": 1, "cycle_hours_used": 70}),
        ("plan_hos_stops", {"trip_drive_hours": 25}),
        ("truck_route", {"origin": "40.7128,-74.0060", "destination": "41.8781,-87.6298",
                         "hazmat_classes": ["3", "2.1", "8", "99"], "tunnel_category": "C"}),
        ("battery_budget_check", {"readings": [{"minute": 0, "battery_pct": 100},
                                               {"minute": 30, "battery_pct": 96.8},
                                               {"minute": 60, "battery_pct": 93.6}]}),
        ("battery_budget_check", {"readings": [{"minute": 0, "battery_pct": 100}, {"minute": 60, "battery_pct": 90}]}),
        ("environment_health", {}),
        ("docker_containers", {}),
    ]
    async with Client(StdioServerParameters(command=sys.executable, args=[str(SERVER)], env=env),
                      raise_exceptions=True) as c:
        print("tools:", sorted(t.name for t in (await c.list_tools()).tools))
        r = []
        for name, args in calls:
            res = await c.call_tool(name, args)
            assert not res.is_error, f"{name} errored: {res.content}"
            r.append(result(res))

    expect(r[0]["binding_limit"].startswith("30-minute") and r[0]["drive_time_remaining_hours"] == 0.5,
           "hos_status: 30-minute break binds at 7.5 h driving")
    expect(r[1]["binding_limit"].startswith("14-hour") and abs(r[1]["drive_time_remaining_hours"] - 0.2) < 1e-6,
           "hos_status: 14-hour window binds")
    expect(not r[2]["can_drive_now"] and "34-hour" in r[2]["next_action"], "hos_status: exhausted 70/8 cycle")
    stops = [s["action"] for s in r[3]["stops"]]
    expect(stops == ["30-minute break", "10-hour off-duty reset", "30-minute break", "10-hour off-duty reset"],
           f"plan_hos_stops 25 h: {stops}")
    url = r[4]["request_url"]
    expect(r[4]["hazmat_mapped"] == ["flammable", "gas", "corrosive"] and r[4]["unknown_hazmat_classes"] == ["99"]
           and "vehicle[grossWeight]=36287" in url and "vehicle[height]=411" in url
           and "vehicle[tunnelCategory]=C" in url and r[4]["called"] is False,
           "truck_route builds HERE v8 truck + hazmat params (lbs/ft -> kg/cm)")
    expect(r[5]["verdict"] == "PASS" and r[5]["drain_pct_per_hour"] == 6.4, "battery 6.4%/h passes 7%/h budget")
    expect(r[6]["verdict"] == "FAIL", "battery 10%/h fails")
    eh = {e["env"]: e for e in r[7]["environments"]}
    expect(eh["staging"]["healthy"] and eh["staging"]["version"] == "0.4.2" and not eh["staging"]["env_mismatch"],
           "environment_health: staging healthy, version read from /version")
    expect(eh["preprod"]["env_mismatch"], "environment_health: flags preprod URL serving the staging build")
    expect(not eh["production"]["healthy"] and not r[7]["all_healthy"], "environment_health: production down")
    expect("error" in r[8] or "containers" in r[8], "docker_containers responds")

    srv.shutdown()
    print("ALL PASSED" if not failures else f"{len(failures)} FAILED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
