import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createHereProvider } from "../src/routing/hereProvider.js";
import { RoutingProviderError, type RoutingProvider } from "../src/routing/index.js";
import {
  compliantRoute,
  DRY_VAN,
  fakeHereKey,
  fetchReturning,
  jsonResponse,
  routeRequest,
  violatingRoute,
} from "./helpers/here.js";

const config = loadConfig({ APP_ENV: "unit", APP_VERSION: "test-sha" });
const quietLogger = () => ({ warn: vi.fn(), error: vi.fn() });

const appWithHere = (body: unknown, logger = quietLogger()) =>
  createApp(config, {
    routingProvider: createHereProvider({ apiKey: fakeHereKey(), fetchFn: fetchReturning(jsonResponse(body)) }),
    logger,
  });

const failingProvider = (error: Error): RoutingProvider => ({
  name: "here",
  route: async () => {
    throw error;
  },
});

describe("POST /api/route", () => {
  it("returns a compliant route", async () => {
    const res = await request(appWithHere(compliantRoute())).post("/api/route").send(routeRequest());
    expect(res.status).toBe(200);
    expect(res.body.geometry).toHaveLength(4);
    expect(res.body.isDemo).toBe(false);
  });

  it("@routing-safety returns 422 NO_SAFE_ROUTE with reasons and no geometry for a violating route", async () => {
    const notice = { title: "Violated vehicle restriction.", code: "violatedVehicleRestriction", severity: "critical" };
    const res = await request(appWithHere(violatingRoute(notice))).post("/api/route").send(routeRequest());
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: {
        code: "NO_SAFE_ROUTE",
        message: "No truck-safe route found for this vehicle.",
        details: { reasons: ["Violated vehicle restriction."] },
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/geometry|polyline/);
  });

  it("@routing-safety returns 422 when HERE finds no route at all", async () => {
    const res = await request(appWithHere({ routes: [], notices: [{ code: "noRouteFound" }] }))
      .post("/api/route")
      .send(routeRequest({ ...DRY_VAN, hazmatClasses: [1], tunnelCategory: "B" }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NO_SAFE_ROUTE");
  });

  it.each([
    ["no truck profile", { origin: routeRequest().origin, destination: routeRequest().destination }],
    ["hazmat class 10", routeRequest({ ...DRY_VAN, hazmatClasses: [10 as never] })],
    ["free-text hazmat", { ...routeRequest(), truck: { ...DRY_VAN, hazmat: ["flammable"] } }],
    ["tunnel category A", { ...routeRequest(), truck: { ...DRY_VAN, tunnelCategory: "A" } }],
    ["latitude out of range", { ...routeRequest(), origin: { lat: 91, lng: 0 } }],
  ])("@routing-safety rejects a request with %s (400, engine not called)", async (_name, body) => {
    const route = vi.fn();
    const app = createApp(config, { routingProvider: { name: "spy", route }, logger: quietLogger() });
    const res = await request(app).post("/api/route").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(route).not.toHaveBeenCalled();
  });

  it("returns 502 for a provider error without exposing the detail", async () => {
    const logger = quietLogger();
    const app = createApp(config, {
      routingProvider: failingProvider(new RoutingProviderError("HERE responded with HTTP 503", 503)),
      logger,
    });
    const res = await request(app).post("/api/route").send(routeRequest());
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("ROUTING_PROVIDER_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("HTTP 503");
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("returns 500 for an unexpected error and does not log its message", async () => {
    const logger = quietLogger();
    const app = createApp(config, { routingProvider: failingProvider(new Error("boom")), logger });
    const res = await request(app).post("/api/route").send(routeRequest());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("boom");
  });

  it("serves the demo route in APP_ENV=unit when no key is configured", async () => {
    const res = await request(createApp(config)).post("/api/route").send(routeRequest());
    expect(res.status).toBe(200);
    expect(res.body.isDemo).toBe(true);
  });
});
