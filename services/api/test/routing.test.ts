import { describe, expect, it } from "vitest";
import { HAZMAT_CLASSES, truckProfileSchema, type TruckProfile } from "../src/contracts/route.js";
import { createDemoProvider } from "../src/routing/demoProvider.js";
import { decodeFlexiblePolyline } from "../src/routing/flexiblePolyline.js";
import { HERE_GOODS_BY_CLASS, HERE_HAZARDOUS_GOODS, toHereHazardousGoods } from "../src/routing/hazmat.js";
import {
  buildHereRouteUrl,
  ceilWhole,
  createHereProvider,
  parseHereResponse,
  type HereNotice,
} from "../src/routing/hereProvider.js";
import { createRoutingProvider, RoutingProviderError } from "../src/routing/index.js";
import {
  compliantRoute,
  DRY_VAN,
  EXAMPLE_POLYLINE,
  fakeHereKey,
  fetchReturning,
  jsonResponse,
  routeRequest,
  violatingRoute,
} from "./helpers/here.js";

const params = (truck: TruckProfile) => buildHereRouteUrl(routeRequest(truck), fakeHereKey().value).searchParams;

describe("decodeFlexiblePolyline", () => {
  it("decodes HERE's published example", () => {
    const expected = [
      [50.10228, 8.69821],
      [50.10201, 8.69567],
      [50.10063, 8.6915],
      [50.09878, 8.68752],
    ];
    const points = decodeFlexiblePolyline(EXAMPLE_POLYLINE);
    expect(points).toHaveLength(expected.length);
    points.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(expected[i]![0]!, 5);
      expect(p.lng).toBeCloseTo(expected[i]![1]!, 5);
    });
  });

  it("rejects invalid characters and truncated input", () => {
    expect(() => decodeFlexiblePolyline("BF!!")).toThrow();
    expect(() => decodeFlexiblePolyline("BFo")).toThrow();
  });
});

describe("ceilWhole", () => {
  it("ignores floating-point noise (BR-47) but never rounds down", () => {
    expect(ceilWhole(4.11 * 100)).toBe(411);
    expect(ceilWhole(411.001)).toBe(412);
    expect(ceilWhole(411)).toBe(411);
  });
});

describe("buildHereRouteUrl", () => {
  it("sends truck mode, both ends and the full truck profile", () => {
    const key = fakeHereKey().value;
    const url = buildHereRouteUrl(routeRequest(), key);
    const p = url.searchParams;
    expect(url.origin + url.pathname).toBe("https://router.hereapi.com/v8/routes");
    expect(p.get("transportMode")).toBe("truck");
    expect(p.get("origin")).toBe("40.7357,-74.1724");
    expect(p.get("destination")).toBe("39.9526,-75.1652");
    expect(p.get("vehicle[height]")).toBe("412");
    expect(p.get("vehicle[width]")).toBe("260");
    expect(p.get("vehicle[length]")).toBe("2134");
    expect(p.get("vehicle[grossWeight]")).toBe("36288");
    expect(p.get("vehicle[axleCount]")).toBe("5");
    expect(p.has("vehicle[shippedHazardousGoods]")).toBe(false);
    expect(p.has("vehicle[tunnelCategory]")).toBe(false);
    expect(p.get("apiKey")).toBe(key);
  });

  it("sends each HERE hazmat category once, sorted, plus the tunnel category", () => {
    const p = params({ ...DRY_VAN, hazmatClasses: [3, 1, 4], tunnelCategory: "D" });
    expect(p.get("vehicle[shippedHazardousGoods]")).toBe("explosive,flammable");
    expect(p.get("vehicle[tunnelCategory]")).toBe("D");
  });
});

describe("parseHereResponse", () => {
  it("returns geometry, totals and instructions for a compliant route", () => {
    const result = parseHereResponse(compliantRoute());
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.route.geometry).toHaveLength(4);
    expect(result.route.distanceM).toBe(186_000);
    expect(result.route.durationS).toBe(8040);
    expect(result.route.isDemo).toBe(false);
    expect(result.route.instructions).toEqual([
      { text: "Head east on Market St.", distanceM: 400, durationS: 60 },
      { text: "Arrive at your destination.", distanceM: 0, durationS: 0 },
    ]);
  });

  it("keeps routes that only carry informational notices", () => {
    expect(parseHereResponse(compliantRoute([{ title: "Simplified polyline", severity: "info" }])).kind).toBe("ok");
  });

  it("reports no safe route when HERE returns no routes", () => {
    expect(parseHereResponse({ routes: [], notices: [{ title: "Route calculation failed", code: "noRouteFound" }] })).toEqual({
      kind: "no_safe_route",
      reasons: ["Route calculation failed"],
    });
  });

  it("turns an unreadable route into a provider error, never a partial route", () => {
    const missing = compliantRoute();
    delete missing.routes![0]!.sections![0]!.polyline;
    expect(() => parseHereResponse(missing)).toThrow(RoutingProviderError);

    const corrupt = compliantRoute();
    corrupt.routes![0]!.sections![0]!.polyline = "BF!!";
    expect(() => parseHereResponse(corrupt)).toThrow(RoutingProviderError);
  });
});

/**
 * @routing-safety: the non-negotiable. Each scenario is a HERE response where the only route
 * found breaks a restriction. The truck must get NO route, never a bad one.
 */
describe("@routing-safety restriction-violating routes are never returned", () => {
  const violated = "Violated vehicle restriction.";
  const scenarios: { name: string; notice: HereNotice }[] = [
    { name: "low bridge (height)", notice: { title: violated, code: "violatedVehicleRestriction", severity: "critical" } },
    { name: "weight-limited bridge", notice: { title: violated, code: "violatedVehicleRestriction", severity: "critical" } },
    { name: "hazmat-prohibited road", notice: { title: violated, code: "violatedVehicleRestriction", severity: "critical" } },
    { name: "hazmat tunnel category", notice: { title: "Violated avoid tunnel.", code: "violatedAvoidTunnel", severity: "critical" } },
    { name: "truck-prohibited zone", notice: { title: "Violated zone restriction.", code: "violatedZoneRestriction", severity: "critical" } },
    { name: "critical notice code HERE adds in the future", notice: { title: "Some new rule", code: "violatedSomethingNew", severity: "critical" } },
    { name: "notice with an unknown severity (fail safe)", notice: { title: "Odd notice", severity: "warning" } },
    { name: "notice with no severity (fail safe)", notice: { code: "unknown" } },
  ];

  it.each(scenarios)("@routing-safety $name: no route, reason given", ({ notice }) => {
    const result = parseHereResponse(violatingRoute(notice));
    expect(result.kind).toBe("no_safe_route");
    expect(result).not.toHaveProperty("route");
    if (result.kind === "no_safe_route") expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("@routing-safety a critical notice at the top level of the response blocks the route", () => {
    const body = { ...compliantRoute(), notices: [{ title: violated, severity: "critical" }] };
    expect(parseHereResponse(body).kind).toBe("no_safe_route");
  });

  it("@routing-safety one critical notice in any section blocks the whole route", () => {
    const body = compliantRoute();
    body.routes![0]!.sections!.push({ polyline: EXAMPLE_POLYLINE, notices: [{ title: violated, severity: "critical" }] });
    expect(parseHereResponse(body).kind).toBe("no_safe_route");
  });

  it("@routing-safety repeated reasons are reported once", () => {
    const body = compliantRoute([
      { title: violated, severity: "critical" },
      { title: violated, severity: "critical" },
    ]);
    expect(parseHereResponse(body)).toEqual({ kind: "no_safe_route", reasons: [violated] });
  });
});

describe("@routing-safety HERE never sees a smaller, lighter or cleaner truck", () => {
  const profiles: { name: string; truck: TruckProfile }[] = [
    { name: "dry van 13'6\"", truck: DRY_VAN },
    { name: "flatbed 8'6\" load", truck: { ...DRY_VAN, heightM: 2.5908, grossWeightKg: 21772.4 } },
    { name: "tanker, class 3 flammable", truck: { ...DRY_VAN, heightM: 3.4036, hazmatClasses: [3], tunnelCategory: "D" } },
    { name: "oversize 14'6\"", truck: { ...DRY_VAN, heightM: 4.4196, widthM: 3.6576, grossWeightKg: 54431.1, axleCount: 7 } },
    { name: "every hazmat class", truck: { ...DRY_VAN, hazmatClasses: [...HAZMAT_CLASSES], tunnelCategory: "B" } },
  ];

  it.each(profiles)("@routing-safety $name", ({ truck }) => {
    const p = params(truck);
    expect(Number(p.get("vehicle[height]"))).toBeGreaterThanOrEqual(truck.heightM * 100);
    expect(Number(p.get("vehicle[width]"))).toBeGreaterThanOrEqual(truck.widthM * 100);
    expect(Number(p.get("vehicle[length]"))).toBeGreaterThanOrEqual(truck.lengthM * 100);
    expect(Number(p.get("vehicle[grossWeight]"))).toBeGreaterThanOrEqual(truck.grossWeightKg);
    expect(Number(p.get("vehicle[axleCount]"))).toBe(truck.axleCount);
    const sent = p.get("vehicle[shippedHazardousGoods]")?.split(",") ?? [];
    for (const hazmatClass of truck.hazmatClasses) {
      for (const good of HERE_GOODS_BY_CLASS[hazmatClass]) expect(sent).toContain(good);
    }
    expect(p.get("vehicle[tunnelCategory]") ?? undefined).toBe(truck.tunnelCategory);
  });

  it.each(HAZMAT_CLASSES)("@routing-safety hazmat class %i maps to at least one valid HERE category", (hazmatClass) => {
    const goods = toHereHazardousGoods([hazmatClass]);
    expect(goods.length).toBeGreaterThan(0);
    for (const good of goods) expect(HERE_HAZARDOUS_GOODS).toContain(good);
  });

  it("@routing-safety inhalation hazards are assumed for classes 2 and 6 until the division is captured", () => {
    expect(toHereHazardousGoods([2])).toContain("poisonousInhalation");
    expect(toHereHazardousGoods([6])).toContain("poisonousInhalation");
  });
});

describe("@routing-safety truck profile validation rejects, never drops, bad hazmat data", () => {
  const parse = (truck: unknown) => truckProfileSchema.safeParse(truck);

  it.each([0, 10, 2.3, -1])("@routing-safety rejects hazmat class %s", (hazmatClass) => {
    expect(parse({ ...DRY_VAN, hazmatClasses: [hazmatClass] }).success).toBe(false);
  });

  it("@routing-safety rejects free-text hazmat categories and the old `hazmat` field", () => {
    expect(parse({ ...DRY_VAN, hazmatClasses: ["flammable"] }).success).toBe(false);
    expect(parse({ ...DRY_VAN, hazmat: ["flammable"] }).success).toBe(false);
  });

  it("@routing-safety requires hazmatClasses: a missing field is not 'no hazmat'", () => {
    const { hazmatClasses: _omitted, ...withoutHazmat } = DRY_VAN;
    expect(parse(withoutHazmat).success).toBe(false);
  });

  it("@routing-safety rejects repeated classes and unknown tunnel categories", () => {
    expect(parse({ ...DRY_VAN, hazmatClasses: [3, 3] }).success).toBe(false);
    expect(parse({ ...DRY_VAN, hazmatClasses: [3], tunnelCategory: "A" }).success).toBe(false);
  });

  it("accepts every class 1–9 and tunnel categories B–E", () => {
    expect(parse({ ...DRY_VAN, hazmatClasses: [...HAZMAT_CLASSES] }).success).toBe(true);
    for (const tunnelCategory of ["B", "C", "D", "E"]) {
      expect(parse({ ...DRY_VAN, hazmatClasses: [1], tunnelCategory }).success).toBe(true);
    }
  });
});

describe("HERE provider", () => {
  it("returns a compliant HERE route", async () => {
    const provider = createHereProvider({ apiKey: fakeHereKey(), fetchFn: fetchReturning(jsonResponse(compliantRoute())) });
    expect((await provider.route(routeRequest())).kind).toBe("ok");
  });

  it("@routing-safety turns a violating HERE route into no_safe_route", async () => {
    const provider = createHereProvider({
      apiKey: fakeHereKey(),
      fetchFn: fetchReturning(jsonResponse(violatingRoute({ title: "Violated vehicle restriction.", severity: "critical" }))),
    });
    expect((await provider.route(routeRequest())).kind).toBe("no_safe_route");
  });

  it("does not leak the HERE error body (it can echo the API key)", async () => {
    const key = fakeHereKey();
    const leaky = new Response(`bad request for ...&apiKey=${key.value}`, { status: 400 });
    const provider = createHereProvider({ apiKey: key, fetchFn: fetchReturning(leaky) });
    const error = await provider.route(routeRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RoutingProviderError);
    expect((error as RoutingProviderError).status).toBe(400);
    expect((error as Error).message).not.toContain(key.value);
  });

  it("does not leak the key from network errors", async () => {
    const key = fakeHereKey();
    const failing = (async (url: URL) => {
      throw new TypeError(`fetch failed for ${url.toString()}`);
    }) as unknown as typeof fetch;
    const error = await createHereProvider({ apiKey: key, fetchFn: failing }).route(routeRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RoutingProviderError);
    expect((error as Error).message).not.toContain(key.value);
  });

  it("wraps non-JSON bodies as provider errors", async () => {
    const provider = createHereProvider({ apiKey: fakeHereKey(), fetchFn: fetchReturning(new Response("<html>")) });
    await expect(provider.route(routeRequest())).rejects.toBeInstanceOf(RoutingProviderError);
  });
});

describe("createRoutingProvider", () => {
  it("uses HERE when a key is configured", () => {
    expect(createRoutingProvider({ appEnv: "prod", hereApiKey: fakeHereKey() }).name).toBe("here");
  });

  it("uses the labelled demo route in development without a key", async () => {
    const provider = createRoutingProvider({ appEnv: "development" });
    expect(provider.name).toBe("demo");
    const result = await provider.route(routeRequest());
    expect(result.kind === "ok" && result.route.isDemo).toBe(true);
  });

  it.each(["staging", "preprod", "prod"] as const)(
    "@routing-safety refuses the straight-line demo route when APP_ENV=%s",
    (appEnv) => {
      expect(() => createRoutingProvider({ appEnv })).toThrow(/HERE_API_KEY is required/);
    }
  );

  it("demo provider is always marked as a demo", async () => {
    const result = await createDemoProvider().route(routeRequest());
    expect(result.kind === "ok" && result.route.isDemo).toBe(true);
  });
});
