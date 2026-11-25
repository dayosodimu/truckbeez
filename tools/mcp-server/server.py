"""TruckBeez MCP server.

Developer/QA tools for TruckBeez (Kitchnow LLC's truck-routing app):
FMCSA hours-of-service math, trip break planning, HERE truck/hazmat routing,
the 7%/hour navigation battery budget, and health checks across the
unit / staging / pre-production / production Docker environments.

Run:  python truckbeez_mcp/server.py           (stdio)
Env:  HERE_API_KEY            enables live calls in truck_route
      TRUCKBEEZ_ENVS          JSON map of env name -> edge base URL, e.g.
                              {"staging":"https://staging.example.com","production":"https://api.example.com"}
                              default {"local":"http://localhost:8080"} (deploy/compose.base.yaml edge port)
      TRUCKBEEZ_HEALTH_PATH   default /healthz  (services/api/src/app.ts)
      TRUCKBEEZ_BATTERY_BUDGET_PCT_PER_HOUR  default 7
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from mcp.server.mcpserver import MCPServer

BATTERY_BUDGET = float(os.environ.get("TRUCKBEEZ_BATTERY_BUDGET_PCT_PER_HOUR", "7"))
HEALTH_PATH = os.environ.get("TRUCKBEEZ_HEALTH_PATH", "/healthz")
DEFAULT_ENVS = {"local": "http://localhost:8080"}

# FMCSA property-carrying limits (49 CFR 395.3)
MAX_DRIVE = 11.0        # hours driving after 10 consecutive hours off
MAX_WINDOW = 14.0       # on-duty window
BREAK_AFTER = 8.0       # cumulative driving before a 30-min interruption is required
BREAK_LEN = 0.5
RESET_OFF = 10.0
CYCLE = {"60/7": 60.0, "70/8": 70.0}

mcp = MCPServer(
    name="truckbeez",
    instructions=(
        "Tools for building and testing TruckBeez, a truck-driver routing app. HOS math follows "
        "FMCSA property-carrying rules (11/14/30-min/60-70); confirm edge cases (adverse driving, "
        "short-haul, split sleeper) against 49 CFR 395 before shipping logic built on them."
    ),
)


# ---------------------------------------------------------------- HOS
@mcp.tool()
def hos_status(driving_hours_today: float, on_duty_window_hours_elapsed: float,
               driving_since_last_break_hours: float, cycle_hours_used: float,
               cycle: Literal["60/7", "70/8"] = "70/8") -> dict:
    """How much a property-carrying driver can still legally drive right now, and which
    FMCSA limit binds first (11-hour driving, 14-hour window, 30-minute break, 60/70-hour cycle)."""
    limits = {
        "11-hour driving limit": MAX_DRIVE - driving_hours_today,
        "14-hour on-duty window": MAX_WINDOW - on_duty_window_hours_elapsed,
        "30-minute break (after 8 h driving)": BREAK_AFTER - driving_since_last_break_hours,
        f"{cycle} cycle limit": CYCLE[cycle] - cycle_hours_used,
    }
    binding = min(limits, key=limits.get)
    remaining = max(0.0, limits[binding])
    if remaining == 0:
        if binding.startswith("30-minute"):
            action = "Take a 30-minute break (any non-driving status) before driving again."
        elif "cycle" in binding:
            action = "Cycle exhausted — needs a 34-hour restart or hours to fall off the cycle."
        else:
            action = "Needs 10 consecutive hours off duty before driving again."
    else:
        action = f"Can drive {remaining:.2f} more hours before hitting the {binding}."
    return {
        "can_drive_now": remaining > 0,
        "drive_time_remaining_hours": round(remaining, 2),
        "binding_limit": binding,
        "remaining_by_limit_hours": {k: round(max(0.0, v), 2) for k, v in limits.items()},
        "next_action": action,
    }


@mcp.tool()
def plan_hos_stops(trip_drive_hours: float, cycle_hours_used: float = 0.0,
                   cycle: Literal["60/7", "70/8"] = "70/8", pre_trip_on_duty_hours: float = 0.25,
                   driving_hours_today: float = 0.0, on_duty_window_hours_elapsed: float = 0.0,
                   driving_since_last_break_hours: float = 0.0) -> dict:
    """Plan the legally required stops for a trip of N driving hours: 30-minute breaks,
    10-hour resets and 34-hour restarts. Starts from the driver's current clocks."""
    drive_left = trip_drive_hours
    d_today, window, since_break, cyc = (driving_hours_today, on_duty_window_hours_elapsed,
                                         driving_since_last_break_hours, cycle_hours_used)
    if window == 0:
        window += pre_trip_on_duty_hours
        cyc += pre_trip_on_duty_hours
    clock, plan = 0.0, []
    for _ in range(200):
        if drive_left <= 1e-9:
            break
        seg = min(drive_left, MAX_DRIVE - d_today, MAX_WINDOW - window, BREAK_AFTER - since_break, CYCLE[cycle] - cyc)
        if seg > 1e-9:
            plan.append({"at_hour": round(clock, 2), "action": "drive", "hours": round(seg, 2)})
            clock += seg; drive_left -= seg; d_today += seg; window += seg; since_break += seg; cyc += seg
            continue
        if CYCLE[cycle] - cyc <= 1e-9:
            plan.append({"at_hour": round(clock, 2), "action": "34-hour restart", "hours": 34})
            clock += 34; d_today = since_break = 0.0; window = pre_trip_on_duty_hours; cyc = pre_trip_on_duty_hours
        elif MAX_DRIVE - d_today <= 1e-9 or MAX_WINDOW - window <= 1e-9:
            plan.append({"at_hour": round(clock, 2), "action": "10-hour off-duty reset", "hours": RESET_OFF})
            clock += RESET_OFF + pre_trip_on_duty_hours
            d_today = since_break = 0.0; window = pre_trip_on_duty_hours; cyc += pre_trip_on_duty_hours
        else:
            plan.append({"at_hour": round(clock, 2), "action": "30-minute break", "hours": BREAK_LEN})
            clock += BREAK_LEN; window += BREAK_LEN; since_break = 0.0
    return {
        "trip_drive_hours": trip_drive_hours,
        "elapsed_hours": round(clock, 2),
        "stops": [p for p in plan if p["action"] != "drive"],
        "timeline": plan,
        "assumptions": "Breaks taken off duty; 34-h restart shown only when the cycle runs out; "
                       "no split-sleeper, adverse-conditions or short-haul exceptions.",
    }


# ---------------------------------------------------------------- routing
HAZMAT_MAP = {  # US DOT hazard class -> HERE Routing v8 shippedHazardousGoods
    "1": ["explosive"], "2.1": ["gas", "flammable"], "2.2": ["gas"], "2.3": ["gas", "poisonousInhalation"],
    "3": ["flammable"], "combustible": ["combustible"], "4.1": ["flammable"], "4.2": ["flammable"],
    "4.3": ["flammable"], "5.1": ["other"], "5.2": ["organic"], "6.1": ["poison"], "6.2": ["other"],
    "7": ["radioactive"], "8": ["corrosive"], "9": ["other"], "marine_pollutant": ["harmfulToWater"],
}


def _ft_in_to_cm(feet: float, inches: float = 0.0) -> int:
    return round((feet * 12 + inches) * 2.54)


@mcp.tool()
def truck_route(origin: str, destination: str, gross_weight_lbs: float = 80000,
                height_ft: float = 13.5, width_ft: float = 8.5, length_ft: float = 72,
                axle_count: int = 5, trailer_count: int = 1, hazmat_classes: list[str] | None = None,
                tunnel_category: Literal["B", "C", "D", "E"] | None = None, call_api: bool = True) -> dict:
    """Build (and, with HERE_API_KEY set, run) a HERE Routing v8 truck route with the truck's
    dimensions and hazmat load. origin/destination are 'lat,lng'. hazmat_classes uses US DOT
    classes like '3', '2.1', '8', or 'combustible'. Returns distance, duration and any
    restriction notices HERE raises (e.g. violated hazmat or height limits)."""
    goods: list[str] = []
    unknown = []
    for c in hazmat_classes or []:
        if c in HAZMAT_MAP:
            goods += [g for g in HAZMAT_MAP[c] if g not in goods]
        else:
            unknown.append(c)
    params = {
        "transportMode": "truck", "origin": origin, "destination": destination,
        "return": "summary,polyline,actions",
        "vehicle[grossWeight]": round(gross_weight_lbs * 0.45359237),
        "vehicle[height]": _ft_in_to_cm(height_ft), "vehicle[width]": _ft_in_to_cm(width_ft),
        "vehicle[length]": _ft_in_to_cm(length_ft), "vehicle[axleCount]": axle_count,
        "vehicle[trailerCount]": trailer_count,
    }
    if goods:
        params["vehicle[shippedHazardousGoods]"] = ",".join(goods)
    if tunnel_category:
        params["vehicle[tunnelCategory]"] = tunnel_category
    url = "https://router.hereapi.com/v8/routes?" + urllib.parse.urlencode(params, safe=",[]")
    out = {"request_url": url, "hazmat_mapped": goods, "unknown_hazmat_classes": unknown,
           "units": "HERE expects kg and cm; converted from lbs and ft."}
    key = os.environ.get("HERE_API_KEY")
    if not call_api or not key:
        out["called"] = False
        out["reason"] = "call_api is false" if not call_api else "HERE_API_KEY not set — append &apiKey=... to call it"
        return out
    try:
        with urllib.request.urlopen(url + "&apiKey=" + urllib.parse.quote(key), timeout=20) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        out.update(called=True, status=e.code, error=e.read().decode("utf-8", "replace")[:800])
        return out
    routes = data.get("routes", [])
    if not routes:
        out.update(called=True, routes=0, notices=data.get("notices", []))
        return out
    secs = [s for s in routes[0]["sections"]]
    length_m = sum(s["summary"]["length"] for s in secs)
    duration_s = sum(s["summary"]["duration"] for s in secs)
    notices = [n for s in secs for n in s.get("notices", [])]
    out.update(called=True, distance_miles=round(length_m / 1609.344, 1),
               drive_hours=round(duration_s / 3600, 2), notices=notices,
               restriction_violations=[n for n in notices if n.get("severity") == "critical"],
               hos=plan_hos_stops(duration_s / 3600)["stops"])
    return out


# ---------------------------------------------------------------- battery
@mcp.tool()
def battery_budget_check(readings: list[dict], budget_pct_per_hour: float = BATTERY_BUDGET) -> dict:
    """Check a navigation battery test against the TruckBeez budget (default 7% per hour).
    readings: [{"minute": 0, "battery_pct": 100}, {"minute": 30, "battery_pct": 96.5}, ...]
    collected from a device test run (e.g. Appium + adb dumpsys battery). Uses a
    least-squares fit so one noisy reading doesn't decide the result."""
    pts = sorted((float(r["minute"]), float(r["battery_pct"])) for r in readings)
    if len(pts) < 2 or pts[-1][0] == pts[0][0]:
        return {"error": "Need at least two readings at different minutes."}
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    slope = sum((x - mx) * (y - my) for x, y in pts) / sum((x - mx) ** 2 for x, _ in pts)  # pct per minute
    drain = -slope * 60
    worst = max(((pts[i][1] - pts[i + 1][1]) / (pts[i + 1][0] - pts[i][0]) * 60
                 for i in range(n - 1) if pts[i + 1][0] > pts[i][0]), default=drain)
    return {
        "duration_minutes": pts[-1][0] - pts[0][0],
        "drain_pct_per_hour": round(drain, 2),
        "worst_interval_pct_per_hour": round(worst, 2),
        "budget_pct_per_hour": budget_pct_per_hour,
        "headroom_pct_per_hour": round(budget_pct_per_hour - drain, 2),
        "hours_of_nav_from_100_to_20": round(80 / drain, 1) if drain > 0 else None,
        "verdict": "PASS" if drain <= budget_pct_per_hour else "FAIL",
        "note": "Run with screen on, GPS active and the device unplugged; 30+ minutes gives a stable fit.",
    }


# ---------------------------------------------------------------- environments
def _envs() -> dict[str, str]:
    raw = os.environ.get("TRUCKBEEZ_ENVS")
    return json.loads(raw) if raw else DEFAULT_ENVS


def _get(url: str, timeout: float = 8.0) -> dict:
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "truckbeez-mcp"}),
                                    timeout=timeout) as r:
            body = r.read(4000).decode("utf-8", "replace")
            return {"status": r.status, "ms": round((time.perf_counter() - t) * 1000), "body": body}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "ms": round((time.perf_counter() - t) * 1000), "body": ""}
    except Exception as e:
        return {"status": None, "ms": round((time.perf_counter() - t) * 1000), "error": str(e)}


@mcp.tool()
def environment_health(envs: list[str] | None = None) -> dict:
    """Check the TruckBeez API in each deployed environment (staging, preprod, production):
    /healthz liveness, /version (service, version, env), and whether a Socket.IO endpoint
    answers yet. Configure edge base URLs with TRUCKBEEZ_ENVS. The unit environment is a
    test-only container with no network, so it has no URL to check."""
    table = _envs()
    names = envs or list(table)

    def check(name: str) -> dict:
        base = table.get(name)
        if not base:
            return {"env": name, "error": "not configured"}
        base = base.rstrip("/")
        api = _get(base + HEALTH_PATH)
        ver = _get(base + "/version")
        sio = _get(base + "/socket.io/?EIO=4&transport=polling")
        info: dict = {}
        try:
            info = json.loads(ver.get("body") or "{}")
        except Exception:
            pass
        reported_env = info.get("env")
        return {"env": name, "base_url": base, "healthz_status": api.get("status"), "healthz_ms": api["ms"],
                "version": info.get("version"), "reported_env": reported_env,
                "env_mismatch": bool(reported_env) and reported_env != name,
                "socketio": "ok" if sio.get("status") == 200 and sio.get("body", "").startswith("0{")
                            else "not available",
                "healthy": api.get("status") == 200,
                "error": api.get("error")}

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(check, names))
    return {"environments": rows, "all_healthy": all(r.get("healthy") for r in rows)}


@mcp.tool()
def docker_containers(name_filter: str = "truckbeez") -> dict:
    """List local Docker containers whose name matches the filter, with status and ports —
    for checking the unit/staging/preprod/prod container instances."""
    if not shutil.which("docker"):
        return {"error": "docker CLI not found on this machine"}
    proc = subprocess.run(["docker", "ps", "-a", "--filter", f"name={name_filter}", "--format", "{{json .}}"],
                          capture_output=True, text=True, timeout=20)
    if proc.returncode != 0:
        return {"error": proc.stderr.strip()}
    rows = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    return {"containers": [{"name": r.get("Names"), "image": r.get("Image"), "state": r.get("State"),
                            "status": r.get("Status"), "ports": r.get("Ports")} for r in rows],
            "running": sum(r.get("State") == "running" for r in rows), "total": len(rows)}


@mcp.resource("truckbeez://hos-rules")
def hos_rules() -> str:
    """FMCSA property-carrying HOS limits used by this server."""
    return ("11 h driving after 10 consecutive h off; no driving after the 14th hour on duty; "
            "30-min break after 8 cumulative h driving; 60 h/7 days or 70 h/8 days; "
            "34 consecutive h off restarts the cycle. Source: 49 CFR 395.3.")


if __name__ == "__main__":
    mcp.run()
