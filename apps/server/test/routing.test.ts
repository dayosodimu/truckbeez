import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeFlexiblePolyline } from "../src/lib/flexiblePolyline.js";
import {
  buildHereRouteUrl,
  ceilWhole,
  HERE_HAZARDOUS_GOODS,
  parseHereRoute,
  type HereNotice,
} from "../src/lib/hereRouting.js";
import { assertRoutingConfigured, getTruckRoute, RoutingProviderError } from "../src/lib/routing.js";
import type { TruckProfile } from "../src/types.js";
import {
  compliantRoute,
  DRY_VAN,
  EXAMPLE_POLYLINE,
  fakeSecret,
  jsonResponse,
  NEWARK,
  PHILADELPHIA,
  violatingRoute,
} from "./fixtures.js";

const params = (profile: TruckProfile) =>
  buildHereRouteUrl(NEWARK, PHILADELPHIA, profile, fakeSecret()).searchParams;

describe("decodeFlexiblePolyline", () => {
  it("decodes HERE's published example", () => {
    const expected = [
      [50.10228, 8.69821],
      [50.10201, 8.69567],
      [50.10063, 8.6915],
      [50.09878, 8.68752],
    ];
    const points = decodeFlexiblePolyline(EXAMPLE_POLYLINE);
    assert.equal(points.length, expected.length);
    points.forEach((p, i) => {
      assert.ok(Math.abs(p.lat - expected[i]![0]!) < 1e-5);
      assert.ok(Math.abs(p.lng - expected[i]![1]!) < 1e-5);
    });
  });

  it("rejects invalid characters and truncated input", () => {
    assert.throws(() => decodeFlexiblePolyline("BF!!"));
    assert.throws(() => decodeFlexiblePolyline("BFo"));
  });
});

describe("ceilWhole", () => {
  it("ignores floating-point noise (BR-47) but never rounds down", () => {
    assert.equal(ceilWhole(4.11 * 100), 411);
    assert.equal(ceilWhole(411.001), 412);
    assert.equal(ceilWhole(411), 411);
  });
});

describe("buildHereRouteUrl", () => {
  it("sends truck mode, both ends and the full truck profile", () => {
    const key = fakeSecret();
    const url = buildHereRouteUrl(NEWARK, PHILADELPHIA, DRY_VAN, key);
    const p = url.searchParams;
    assert.equal(url.origin + url.pathname, "https://router.hereapi.com/v8/routes");
    assert.equal(p.get("transportMode"), "truck");
    assert.equal(p.get("origin"), "40.7357,-74.1724");
    assert.equal(p.get("destination"), "39.9526,-75.1652");
    assert.equal(p.get("vehicle[height]"), "412");
    assert.equal(p.get("vehicle[width]"), "260");
    assert.equal(p.get("vehicle[length]"), "2134");
    assert.equal(p.get("vehicle[grossWeight]"), "36288");
    assert.equal(p.get("vehicle[axleCount]"), "5");
    assert.equal(p.has("vehicle[shippedHazardousGoods]"), false);
    assert.equal(p.has("vehicle[tunnelCategory]"), false);
    assert.equal(p.get("apiKey"), key);
  });

  it("sends hazmat goods once each, and the tunnel category", () => {
    const p = params({ ...DRY_VAN, hazmat: ["flammable", "explosive", "flammable"], tunnelCategory: "D" });
    assert.equal(p.get("vehicle[shippedHazardousGoods]"), "explosive,flammable");
    assert.equal(p.get("vehicle[tunnelCategory]"), "D");
  });
});

describe("parseHereRoute", () => {
  it("returns geometry, totals and instructions for a compliant route", () => {
    const outcome = parseHereRoute(compliantRoute());
    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.equal(outcome.route.provider, "here");
    assert.equal(outcome.route.coordinates.length, 4);
    assert.equal(outcome.route.distanceM, 186_000);
    assert.equal(outcome.route.durationS, 8040);
    assert.deepEqual(outcome.route.instructions, ["Head east on Market St.", "Arrive at your destination."]);
  });

  it("keeps routes that only carry informational notices", () => {
    const outcome = parseHereRoute(compliantRoute([{ title: "Simplified polyline", severity: "info" }]));
    assert.equal(outcome.kind, "ok");
  });

  it("reports no safe route when HERE returns no routes", () => {
    const outcome = parseHereRoute({ routes: [], notices: [{ title: "Route calculation failed", code: "noRouteFound" }] });
    assert.deepEqual(outcome, { kind: "no_safe_route", reasons: ["Route calculation failed"] });
  });
});

/**
 * @routing-safety: the non-negotiable. Every scenario below is a HERE response where the
 * only route found breaks a restriction. The truck must get NO route, never a bad one.
 */
describe("@routing-safety: restriction-violating routes are never returned", () => {
  const scenarios: { name: string; notice: HereNotice }[] = [
    { name: "low bridge (height)", notice: { title: "Violated vehicle restriction.", code: "violatedVehicleRestriction", severity: "critical" } },
    { name: "weight-limited bridge", notice: { title: "Violated vehicle restriction.", code: "violatedVehicleRestriction", severity: "critical" } },
    { name: "hazmat-prohibited road", notice: { title: "Violated vehicle restriction.", code: "violatedVehicleRestriction", severity: "critical" } },
    { name: "hazmat tunnel category", notice: { title: "Violated avoid tunnel.", code: "violatedAvoidTunnel", severity: "critical" } },
    { name: "truck-prohibited zone", notice: { title: "Violated zone restriction.", code: "violatedZoneRestriction", severity: "critical" } },
    { name: "critical notice code HERE adds in the future", notice: { title: "Some new rule", code: "violatedSomethingNew", severity: "critical" } },
    { name: "notice with no severity (fail safe)", notice: { title: "Unclassified notice", code: "unknown" } },
  ];

  for (const { name, notice } of scenarios) {
    it(`@routing-safety ${name}: no route, reason given`, () => {
      const outcome = parseHereRoute(violatingRoute(notice));
      assert.equal(outcome.kind, "no_safe_route");
      assert.ok(!("route" in outcome), "a no_safe_route outcome must carry no geometry");
      if (outcome.kind === "no_safe_route") assert.ok(outcome.reasons.length > 0);
    });
  }

  it("@routing-safety a critical notice at the top level of the response also blocks the route", () => {
    const body = { ...compliantRoute(), notices: [{ title: "Violated vehicle restriction.", severity: "critical" }] };
    assert.equal(parseHereRoute(body).kind, "no_safe_route");
  });

  it("@routing-safety one critical notice in any section blocks the whole route", () => {
    const body = compliantRoute();
    body.routes![0]!.sections!.push({
      polyline: EXAMPLE_POLYLINE,
      notices: [{ title: "Violated vehicle restriction.", severity: "critical" }],
    });
    assert.equal(parseHereRoute(body).kind, "no_safe_route");
  });
});

describe("@routing-safety: HERE never sees a smaller, lighter or cleaner truck", () => {
  const profiles: { name: string; profile: TruckProfile }[] = [
    { name: "dry van 13'6\"", profile: DRY_VAN },
    { name: "flatbed 8'6\" load", profile: { ...DRY_VAN, heightCm: 259.08, grossWeightKg: 21772.4 } },
    { name: "tanker, flammable", profile: { ...DRY_VAN, heightCm: 340.36, hazmat: ["flammable"], tunnelCategory: "D" } },
    { name: "oversize 14'6\"", profile: { ...DRY_VAN, heightCm: 441.96, widthCm: 365.76, grossWeightKg: 54431.1, axleCount: 7 } },
    { name: "every hazmat category", profile: { ...DRY_VAN, hazmat: [...HERE_HAZARDOUS_GOODS], tunnelCategory: "B" } },
  ];

  for (const { name, profile } of profiles) {
    it(`@routing-safety ${name}`, () => {
      const p = params(profile);
      assert.ok(Number(p.get("vehicle[height]")) >= profile.heightCm);
      assert.ok(Number(p.get("vehicle[width]")) >= profile.widthCm);
      assert.ok(Number(p.get("vehicle[length]")) >= profile.lengthCm);
      assert.ok(Number(p.get("vehicle[grossWeight]")) >= profile.grossWeightKg);
      assert.equal(Number(p.get("vehicle[axleCount]")), profile.axleCount);
      const sent = p.get("vehicle[shippedHazardousGoods]")?.split(",") ?? [];
      for (const good of profile.hazmat) assert.ok(sent.includes(good), `hazmat "${good}" was not sent`);
      assert.equal(p.get("vehicle[tunnelCategory]") ?? undefined, profile.tunnelCategory);
    });
  }
});

describe("getTruckRoute", () => {
  const fetchReturning = (response: Response) => (async () => response) as unknown as typeof fetch;

  it("returns a compliant HERE route", async () => {
    const outcome = await getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, {
      apiKey: fakeSecret(),
      fetchFn: fetchReturning(jsonResponse(compliantRoute())),
    });
    assert.equal(outcome.kind, "ok");
  });

  it("@routing-safety turns a violating HERE route into no_safe_route", async () => {
    const outcome = await getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, {
      apiKey: fakeSecret(),
      fetchFn: fetchReturning(jsonResponse(violatingRoute({ title: "Violated vehicle restriction.", severity: "critical" }))),
    });
    assert.equal(outcome.kind, "no_safe_route");
  });

  it("does not leak the HERE error body (it can echo the API key)", async () => {
    const key = fakeSecret();
    const leaky = new Response(`bad request for ...&apiKey=${key}`, { status: 400 });
    await assert.rejects(
      getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, { apiKey: key, fetchFn: fetchReturning(leaky) }),
      (err: unknown) => {
        assert.ok(err instanceof RoutingProviderError);
        assert.equal(err.status, 400);
        assert.ok(!err.message.includes(key));
        return true;
      }
    );
  });

  it("wraps network failures and non-JSON bodies as provider errors", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await assert.rejects(getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, { apiKey: fakeSecret(), fetchFn: failing }), RoutingProviderError);
    await assert.rejects(
      getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, { apiKey: fakeSecret(), fetchFn: fetchReturning(new Response("<html>")) }),
      RoutingProviderError
    );
  });

  it("uses the labelled demo route in development without a key", async () => {
    const outcome = await getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, { apiKey: "", nodeEnv: "development" });
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") assert.equal(outcome.route.provider, "demo");
  });

  it("@routing-safety refuses the straight-line demo route in production", async () => {
    await assert.rejects(getTruckRoute(NEWARK, PHILADELPHIA, DRY_VAN, { apiKey: "", nodeEnv: "production" }));
    assert.throws(() => assertRoutingConfigured({ NODE_ENV: "production" }));
    assert.doesNotThrow(() => assertRoutingConfigured({ NODE_ENV: "production", HERE_API_KEY: fakeSecret() }));
    assert.doesNotThrow(() => assertRoutingConfigured({ NODE_ENV: "development" }));
  });
});
