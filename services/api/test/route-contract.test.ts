/**
 * BR-64: API contract suite for POST /api/route and the truck profile it carries.
 *
 * route-endpoint.test.ts covers behaviour (200 / 422 / 502 / 500, safety assumptions).
 * This file pins the CONTRACT the mobile app depends on: what a valid truck profile is at
 * its boundaries, the exact success body shape, and the error envelope on every failure.
 * There is no separate truck-profile endpoint yet: the profile travels with every route
 * request (contracts/route.ts), so its validation is tested through this endpoint.
 *
 * Traceability: UC-03 (plan a truck-safe route), UC-04 (no truck-safe route), ADR-0003.
 * Known bugs are pinned with `it.fails` so they turn red the moment they are fixed and the
 * test must be flipped: BR-71, BR-72.
 */
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { TUNNEL_CATEGORIES, type TruckProfile } from "../src/contracts/route.js";
import { createHereProvider } from "../src/routing/hereProvider.js";
import { compliantRoute, DRY_VAN, fakeHereKey, jsonResponse, NEWARK, PHILADELPHIA, routeRequest } from "./helpers/here.js";

const config = loadConfig({ APP_ENV: "unit", APP_VERSION: "test-sha" });
const quietLogger = () => ({ warn: vi.fn(), error: vi.fn() });

/** An app on a fake HERE that returns `body`, plus the fetch spy to assert HERE was (not) called. */
function appWithHere(body: unknown = compliantRoute()) {
  const fetchFn = vi.fn(async () => jsonResponse(body));
  const app = createApp(config, {
    routingProvider: createHereProvider({ apiKey: fakeHereKey(), fetchFn: fetchFn as unknown as typeof fetch }),
    logger: quietLogger(),
  });
  return { app, fetchFn };
}

const post = (body: unknown, here = appWithHere()) => request(here.app).post("/api/route").send(body as object);

/** The error envelope every failure must use (contracts/route.ts ApiError). */
function expectErrorEnvelope(body: unknown, code: string) {
  expect(body).toEqual({
    error: expect.objectContaining({ code, message: expect.any(String) }),
  });
  expect(Object.keys((body as { error: object }).error).every((k) => ["code", "message", "details"].includes(k))).toBe(true);
}

describe("BR-64 truck profile boundaries (UC-03 inputs)", () => {
  // [field, largest accepted, smallest rejected above it]
  const upperBounds: [keyof TruckProfile, number, number][] = [
    ["heightM", 6, 6.001],
    ["widthM", 5, 5.001],
    ["lengthM", 50, 50.001],
    ["grossWeightKg", 200_000, 200_000.1],
    ["axleCount", 20, 21],
  ];

  it.each(upperBounds)("accepts %s at its maximum (%s)", async (field, max) => {
    const res = await post(routeRequest({ ...DRY_VAN, [field]: max }));
    expect(res.status).toBe(200);
  });

  it.each(upperBounds)("@routing-safety rejects %s above its maximum and never calls HERE", async (field, _max, over) => {
    const here = appWithHere();
    const res = await post(routeRequest({ ...DRY_VAN, [field]: over }), here);
    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, "INVALID_REQUEST");
    expect(here.fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["heightM", 0],
    ["widthM", -1],
    ["lengthM", 0],
    ["grossWeightKg", 0],
    ["axleCount", 1],
  ] as const)("@routing-safety rejects %s = %s (a zero or negative truck is never routed)", async (field, value) => {
    const here = appWithHere();
    const res = await post(routeRequest({ ...DRY_VAN, [field]: value }), here);
    expect(res.status).toBe(400);
    expect(here.fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["axleCount as a fraction", { axleCount: 5.5 }],
    ["heightM as a string", { heightM: "4.1" }],
    ["heightM as null", { heightM: null }],
    ["grossWeightKg as Infinity (JSON null)", { grossWeightKg: Number.POSITIVE_INFINITY }],
    ["an unknown field", { trailerCount: 1 }],
    ["the old imperial field", { heightFt: 13.5 }],
  ])("@routing-safety rejects %s", async (_name, patch) => {
    const here = appWithHere();
    const res = await post(routeRequest({ ...DRY_VAN, ...patch } as TruckProfile), here);
    expect(res.status).toBe(400);
    expect(here.fetchFn).not.toHaveBeenCalled();
  });

  it.each(["heightM", "widthM", "lengthM", "grossWeightKg", "axleCount"] as const)(
    "@routing-safety rejects a profile with no %s (missing is never 'small')",
    async (field) => {
      const { [field]: _omitted, ...truck } = DRY_VAN;
      const res = await post(routeRequest(truck as TruckProfile));
      expect(res.status).toBe(400);
    }
  );

  it.each(TUNNEL_CATEGORIES)("accepts tunnel category %s for a hazmat load", async (tunnelCategory) => {
    const res = await post(routeRequest({ ...DRY_VAN, hazmatClasses: [3], tunnelCategory }));
    expect(res.status).toBe(200);
  });
});

describe("BR-64 origin and destination", () => {
  it.each([
    ["lat above 90", { lat: 90.0001, lng: 0 }],
    ["lat below -90", { lat: -90.0001, lng: 0 }],
    ["lng above 180", { lat: 0, lng: 180.0001 }],
    ["lng below -180", { lat: 0, lng: -180.0001 }],
    ["a string coordinate", { lat: "40.7", lng: -74.1 }],
    ["a missing lng", { lat: 40.7 }],
  ])("rejects an origin with %s", async (_name, origin) => {
    const here = appWithHere();
    const res = await post({ ...routeRequest(), origin }, here);
    expect(res.status).toBe(400);
    expect(here.fetchFn).not.toHaveBeenCalled();
  });

  it("accepts the coordinate extremes", async () => {
    const res = await post({ origin: { lat: -90, lng: -180 }, destination: { lat: 90, lng: 180 }, truck: DRY_VAN });
    expect(res.status).toBe(200);
  });

  it.each(["origin", "destination", "truck"] as const)("rejects a request with no %s", async (field) => {
    const { [field]: _omitted, ...body } = routeRequest();
    const res = await post(body);
    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, "INVALID_REQUEST");
  });
});

describe("BR-64 request transport", () => {
  it("rejects a body that is not JSON with a 400 and a generic message", async () => {
    const res = await request(appWithHere().app)
      .post("/api/route")
      .set("Content-Type", "application/json")
      .send('{"origin": ');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("origin");
  });

  it("rejects a body over the 100 kb limit with 413", async () => {
    const res = await post({ ...routeRequest(), padding: "x".repeat(110 * 1024) });
    expect(res.status).toBe(413);
  });

  it("does not route a form-encoded body", async () => {
    const here = appWithHere();
    const res = await request(here.app).post("/api/route").type("form").send({ origin: "x" });
    expect(res.status).toBe(400);
    expect(here.fetchFn).not.toHaveBeenCalled();
  });

  it.each(["get", "put", "delete"] as const)("answers %s /api/route with 404, not a route", async (method) => {
    const res = await request(appWithHere().app)[method]("/api/route");
    expect(res.status).toBe(404);
  });
});

describe("BR-64 success contract (UC-03)", () => {
  it("returns exactly the RouteResponse fields with the right types", async () => {
    const res = await post(routeRequest({ ...DRY_VAN, hazmatClasses: [3], tunnelCategory: "D" }));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(
      ["avoidedRestrictions", "distanceM", "durationS", "geometry", "instructions", "isDemo", "safetyAssumptions"].sort()
    );
    expect(res.body).toEqual({
      geometry: expect.arrayContaining([{ lat: expect.any(Number), lng: expect.any(Number) }]),
      distanceM: 186_000,
      durationS: 8040,
      instructions: expect.any(Array),
      avoidedRestrictions: expect.any(Array),
      isDemo: false,
      safetyAssumptions: [],
    });
    for (const step of res.body.instructions) {
      expect(step).toEqual({ text: expect.any(String), distanceM: expect.any(Number), durationS: expect.any(Number) });
    }
  });

  it("geometry points are valid coordinates", async () => {
    const res = await post(routeRequest());
    for (const { lat, lng } of res.body.geometry) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
  });

  it("never echoes the truck profile or the HERE key back to the client", async () => {
    const res = await post({ origin: NEWARK, destination: PHILADELPHIA, truck: DRY_VAN });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/apiKey|heightM|grossWeightKg/);
  });
});

describe("BR-64 error contract (UC-04 and failures)", () => {
  it("400 names the failing top-level field under details without echoing the value", async () => {
    const res = await post(routeRequest({ ...DRY_VAN, heightM: 987.654 }));
    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, "INVALID_REQUEST");
    // zod flatten() keeps top-level keys only, so a bad heightM is reported under "truck".
    // Nested paths (truck.heightM) would let the profile editor highlight the field: see PR notes.
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(["truck"]);
    expect(JSON.stringify(res.body)).not.toContain("987.654");
  });

  it("422 NO_SAFE_ROUTE uses the envelope, with reasons and safetyAssumptions in details", async () => {
    const notice = { title: "Violated vehicle restriction.", code: "violatedVehicleRestriction", severity: "critical" };
    const res = await post(routeRequest(), appWithHere(compliantRoute([notice])));
    expect(res.status).toBe(422);
    expectErrorEnvelope(res.body, "NO_SAFE_ROUTE");
    expect(res.body.error.details).toEqual({ reasons: expect.any(Array), safetyAssumptions: [] });
  });

  it("502 ROUTING_PROVIDER_ERROR uses the envelope and has no details", async () => {
    const res = await post(routeRequest(), appWithHere({ routes: [{ sections: [{ polyline: "!!!" }] }] }));
    expect(res.status).toBe(502);
    expectErrorEnvelope(res.body, "ROUTING_PROVIDER_ERROR");
    expect(res.body.error.details).toBeUndefined();
  });

  // Known bug BR-71: a 200 from HERE whose JSON has the wrong shape is a 500, not a 502.
  // When BR-71 is fixed this test fails: change `it.fails` to `it`.
  it.fails("BR-71 a malformed HERE body (sections not a list) is a 502 provider error", async () => {
    const res = await post(routeRequest(), appWithHere({ routes: [{ sections: {} }] }));
    expect(res.status).toBe(502);
    expectErrorEnvelope(res.body, "ROUTING_PROVIDER_ERROR");
  });

  // Known bug BR-72: the app-level 404 and the generic error handler use { error: "text" },
  // not the { error: { code, message } } envelope. When fixed, change `it.fails` to `it`.
  it.fails("BR-72 unknown paths answer with the error envelope (NOT_FOUND)", async () => {
    const res = await request(appWithHere().app).get("/api/nope");
    expect(res.status).toBe(404);
    expectErrorEnvelope(res.body, "NOT_FOUND");
  });

  it.fails("BR-72 a malformed JSON body answers with the error envelope", async () => {
    const res = await request(appWithHere().app)
      .post("/api/route")
      .set("Content-Type", "application/json")
      .send("{");
    expectErrorEnvelope(res.body, "INVALID_REQUEST");
  });
});
