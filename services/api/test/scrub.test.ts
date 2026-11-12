import { describe, expect, it } from "vitest";
import {
  COORDS,
  FILTERED,
  scrubEvent,
  scrubString,
  scrubUrl,
  secretValuesFromEnv,
} from "../src/errorReporting/scrub.js";
import { fakeToken } from "./helpers/fakeValues.js";

// Coordinates used below are generated so the test file does not pin a real place.
const lat = () => Number((Math.random() * 80 - 40).toFixed(6)) + 0.000001;
const lng = () => Number((Math.random() * 160 - 80).toFixed(6)) + 0.000001;

describe("scrubString", () => {
  it("replaces coordinate-looking pairs", () => {
    const a = lat().toFixed(5);
    const b = lng().toFixed(5);
    for (const text of [`at ${a},${b}`, `at ${a}, ${b}`, `at ${a} ${b}`, `/route/${a};${b}/eta`]) {
      const out = scrubString(text);
      expect(out).not.toContain(a);
      expect(out).not.toContain(b);
      expect(out).toContain(COORDS);
    }
  });

  it("replaces lat/lng assignments in query strings and JSON text", () => {
    const a = lat().toFixed(4);
    const b = lng().toFixed(4);
    const out = scrubString(`lat=${a}&lng=${b} {"latitude": ${a}, "longitude":"${b}"} lon: ${b}`);
    expect(out).not.toMatch(/\d+\.\d{3,}/);
    expect(out).toContain(`lat=${FILTERED}`);
  });

  it("redacts key/token/apikey query parameters", () => {
    const secret = fakeToken();
    for (const param of ["key", "apikey", "apiKey", "api_key", "token", "access_token", "signature"]) {
      const out = scrubString(`GET https://router.example.test/v8/routes?origin=a&${param}=${secret}&x=1`);
      expect(out).not.toContain(secret);
      expect(out).toContain(`${param}=${FILTERED}`);
    }
  });

  it("redacts URL credentials and bearer tokens", () => {
    const password = fakeToken();
    const token = fakeToken();
    const out = scrubString(`connect postgres://truckbeez:${password}@db:5432/x failed; Authorization: Bearer ${token}`);
    expect(out).not.toContain(password);
    expect(out).not.toContain(token);
  });

  it("removes known secret values wherever they appear", () => {
    const secret = fakeToken();
    expect(scrubString(`upstream said: invalid key ${secret}.`, { secretValues: [secret] })).toBe(
      `upstream said: invalid key ${FILTERED}.`
    );
  });

  it("leaves ordinary text, versions and integers alone", () => {
    const text = "TypeError: cannot read properties of undefined (reading 'id') in v1.2 at line 42, col 7";
    expect(scrubString(text)).toBe(text);
  });
});

describe("scrubUrl", () => {
  it("drops the query string and fragment entirely", () => {
    expect(scrubUrl(`https://api.truckbeez.test/v1/routes?from=${lat()},${lng()}&token=${fakeToken()}#x`)).toBe(
      "https://api.truckbeez.test/v1/routes"
    );
  });
});

describe("scrubEvent", () => {
  function sampleEvent() {
    const a = lat();
    const b = lng();
    const token = fakeToken();
    const event = {
      event_id: "abc123",
      environment: "staging",
      release: "sha",
      message: `routing failed near ${a.toFixed(5)},${b.toFixed(5)}`,
      user: { id: "driver-1", email: "driver@example.test", ip_address: "203.0.113.5" },
      request: {
        method: "POST",
        url: `https://api.truckbeez.test/v1/routes?lat=${a}&lng=${b}&apikey=${token}`,
        query_string: `lat=${a}&lng=${b}`,
        data: { origin: { lat: a, lng: b }, hazmatClass: 3 },
        cookies: { session: token },
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `sid=${token}`,
          "X-Api-Key": token,
          "User-Agent": "TruckBeez/1.0",
          "X-Forwarded-For": "203.0.113.5",
          "Content-Type": "application/json",
        },
      },
      extra: {
        lat: a,
        Longitude: b,
        position: { latitude: a, longitude: b },
        geometry: { type: "LineString", coordinates: [[b, a]] },
        shape: { type: "Point", coords2: [b, a] },
        lastFix: [b, a],
        hazmatClass: 3,
        routeCount: 2,
        password: token,
        stripeSignature: token,
      },
      exception: {
        values: [
          {
            type: "Error",
            value: `HERE request failed: https://router.example.test/v8?apiKey=${token}&origin=${a},${b}`,
            stacktrace: { frames: [{ filename: "/app/dist/routing.js", lineno: 10, vars: { lat: a, apiKey: token } }] },
          },
        ],
      },
      breadcrumbs: [{ category: "http", message: `GET /v1/eta?lat=${a}&lng=${b}`, data: { url: "x", body: "y" } }],
    };
    return { event, a, b, token };
  }

  it("never lets coordinates, PII, bodies or secrets through", () => {
    const { event, a, b, token } = sampleEvent();
    const out = scrubEvent(event, { secretValues: [token] });
    const json = JSON.stringify(out);

    expect(json).not.toContain(String(a));
    expect(json).not.toContain(String(b));
    expect(json).not.toContain(a.toFixed(5));
    expect(json).not.toContain(b.toFixed(5));
    expect(json).not.toContain(token);
    expect(json).not.toContain("driver@example.test");
    expect(json).not.toContain("203.0.113.5");
    expect(json).not.toContain("TruckBeez/1.0");
  });

  it("keeps the request to method, path and safe headers", () => {
    const { event } = sampleEvent();
    const out = scrubEvent(event);
    expect(out.request).toEqual({
      method: "POST",
      url: "https://api.truckbeez.test/v1/routes",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("drops user, stack-frame variables and breadcrumb bodies", () => {
    const { event } = sampleEvent();
    const out = scrubEvent(event) as Record<string, any>;
    expect(out.user).toBeUndefined();
    expect(out.exception.values[0].stacktrace.frames[0].vars).toBeUndefined();
    expect(out.exception.values[0].stacktrace.frames[0].lineno).toBe(10);
    expect(out.breadcrumbs[0].data).toBeUndefined();
  });

  it("filters location and sensitive keys but keeps useful diagnostics", () => {
    const { event } = sampleEvent();
    const extra = (scrubEvent(event) as Record<string, any>).extra;
    expect(extra.lat).toBe(FILTERED);
    expect(extra.Longitude).toBe(FILTERED);
    expect(extra.position).toBe(FILTERED);
    expect(extra.geometry).toBe(FILTERED);
    expect(extra.shape).toEqual({ type: "Point", coords2: COORDS });
    expect(extra.lastFix).toBe(COORDS);
    expect(extra.password).toBe(FILTERED);
    expect(extra.stripeSignature).toBe(FILTERED);
    expect(extra.hazmatClass).toBe(3);
    expect(extra.routeCount).toBe(2);
  });

  it("does not mutate the original event and survives cycles", () => {
    const { event } = sampleEvent();
    const before = JSON.stringify(event);
    const cyclic: Record<string, unknown> = { name: "x" };
    cyclic.self = cyclic;
    scrubEvent({ ...event, extra: { ...event.extra, cyclic } });
    expect(JSON.stringify(event)).toBe(before);
  });

  it("does not filter unrelated keys that merely contain a sensitive substring", () => {
    const out = scrubEvent({ extra: { driving: true, provinceCode: "ON" } }) as Record<string, any>;
    expect(out.extra).toEqual({ driving: true, provinceCode: "ON" });
  });
});

describe("secretValuesFromEnv", () => {
  it("collects secret-looking variables and URL passwords, not ordinary config", () => {
    const dsn = `https://${fakeToken()}@o1.ingest.invalid/1`;
    const dbPassword = fakeToken();
    const values = secretValuesFromEnv({
      SENTRY_DSN: dsn,
      DATABASE_URL: `postgres://truckbeez:${dbPassword}@db:5432/truckbeez`,
      HERE_API_KEY: fakeToken(),
      APP_ENV: "staging",
      PORT: "3000",
    });
    expect(values).toContain(dsn);
    expect(values).toContain(dbPassword);
    expect(values).not.toContain("staging");
    expect(values).not.toContain("3000");
  });
});
