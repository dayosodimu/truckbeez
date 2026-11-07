import * as Sentry from "@sentry/node";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  buildSentryOptions,
  initErrorReporting,
  noopReporter,
  type ErrorReporter,
  type SentrySdk,
} from "../src/errorReporting/index.js";
import { errorHandler } from "../src/errors.js";
import { fakeDsn, fakeToken } from "./helpers/fakeValues.js";

function fakeSdk() {
  return {
    init: vi.fn(),
    captureException: vi.fn(() => "evt-" + fakeToken(4)),
    flush: vi.fn(async () => true),
  } satisfies Record<keyof SentrySdk, unknown>;
}

describe("initErrorReporting", () => {
  it("is a no-op when SENTRY_DSN is unset or empty", () => {
    const sdk = fakeSdk();
    expect(initErrorReporting({ APP_ENV: "staging" }, { sdk: sdk as unknown as SentrySdk })).toBe(noopReporter);
    expect(initErrorReporting({ SENTRY_DSN: "  " }, { sdk: sdk as unknown as SentrySdk })).toBe(noopReporter);
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it("rejects an invalid DSN without echoing it", () => {
    const bogus = fakeToken();
    const sdk = fakeSdk();
    expect(() => initErrorReporting({ SENTRY_DSN: bogus }, { sdk: sdk as unknown as SentrySdk })).toThrow(
      /^SENTRY_DSN is not a valid DSN/
    );
    try {
      initErrorReporting({ SENTRY_DSN: bogus }, { sdk: sdk as unknown as SentrySdk });
    } catch (err) {
      expect((err as Error).message).not.toContain(bogus);
    }
  });

  it("initialises with environment = APP_ENV and release = APP_VERSION", () => {
    const sdk = fakeSdk();
    const dsn = fakeDsn();
    const reporter = initErrorReporting(
      { SENTRY_DSN: dsn, APP_ENV: "preprod", APP_VERSION: "0123abcd" },
      { sdk: sdk as unknown as SentrySdk }
    );
    expect(reporter.enabled).toBe(true);
    const options = sdk.init.mock.calls[0]![0] as unknown as Sentry.NodeOptions;
    expect(options.dsn).toBe(dsn);
    expect(options.environment).toBe("preprod");
    expect(options.release).toBe("0123abcd");
  });

  it("turns off default integrations and every data-collection category", () => {
    const options = buildSentryOptions({ APP_ENV: "prod" }, fakeDsn());
    expect(options.defaultIntegrations).toBe(false);
    const names = (options.integrations as { name: string }[]).map((i) => i.name);
    for (const unwanted of ["Http", "NodeFetch", "Console", "RequestData", "LocalVariables", "Express"]) {
      expect(names).not.toContain(unwanted);
    }
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    expect(options.tracesSampleRate).toBeUndefined();
  });

  it("passes low-cardinality tags and returns the event id", () => {
    const sdk = fakeSdk();
    const reporter = initErrorReporting({ SENTRY_DSN: fakeDsn() }, { sdk: sdk as unknown as SentrySdk });
    const err = new Error("boom");
    const id = reporter.captureException(err, { method: "GET", route: "/v1/x", status: 500, missing: undefined });
    expect(id).toMatch(/^evt-/);
    expect(sdk.captureException).toHaveBeenCalledWith(err, { tags: { method: "GET", route: "/v1/x", status: 500 } });
  });
});

describe("Sentry SDK with our options (in-memory transport, no network)", () => {
  afterEach(async () => {
    await Sentry.close(0);
  });

  it("sends the event scrubbed: no coordinates, secrets or request data", async () => {
    const sent: string[] = [];
    const apiKey = fakeToken();
    const env = { APP_ENV: "staging", APP_VERSION: "test-sha", HERE_API_KEY: apiKey };
    Sentry.init({
      ...buildSentryOptions(env, fakeDsn()),
      // Global handlers would hook the test runner's process; the scrubbing path is what's under test.
      integrations: [],
      transport: () => ({
        send: async (envelope) => {
          sent.push(JSON.stringify(envelope));
          return {};
        },
        flush: async () => true,
      }),
    });

    const lat = (Math.random() * 40 + 10).toFixed(5);
    const lng = (-(Math.random() * 40 + 70)).toFixed(5);
    Sentry.addBreadcrumb({ category: "routing", message: `requested route from ${lat},${lng}` });
    Sentry.withScope((scope) => {
      scope.setExtra("lastFix", { lat: Number(lat), lng: Number(lng) });
      scope.setUser({ id: "driver-7", email: "driver@example.test" });
      Sentry.captureException(new Error(`HERE 401 for ?apiKey=${apiKey}&origin=${lat},${lng}`));
    });
    await Sentry.flush(1000);

    const payload = sent.join("\n");
    expect(payload).toContain("staging");
    expect(payload).toContain("test-sha");
    expect(payload).toContain("HERE 401");
    expect(payload).not.toContain(lat);
    expect(payload).not.toContain(lng);
    expect(payload).not.toContain(apiKey);
    expect(payload).not.toContain("driver@example.test");
  });
});

describe("Express error path", () => {
  function recordingReporter(): ErrorReporter & { calls: unknown[][] } {
    const calls: unknown[][] = [];
    return {
      enabled: true,
      calls,
      captureException: (...args) => {
        calls.push(args);
        return "ref-123";
      },
      flush: async () => true,
    };
  }

  function appWith(reporter: ErrorReporter, logs: string[], env: NodeJS.ProcessEnv = {}) {
    const app = express();
    app.use(express.json());
    app.get("/v1/routes/:id", () => {
      throw new Error(`route engine failed at ${(41.12345).toFixed(5)},${(-87.6543).toFixed(5)} key=${env.HERE_API_KEY}`);
    });
    app.get("/v1/forbidden", () => {
      throw Object.assign(new Error("nope"), { status: 403 });
    });
    app.use(errorHandler(reporter, (l) => logs.push(l), env));
    return app;
  }

  it("reports 5xx, answers generically with a reference and logs without coordinates or secrets", async () => {
    const reporter = recordingReporter();
    const logs: string[] = [];
    const apiKey = fakeToken();
    const res = await request(appWith(reporter, logs, { HERE_API_KEY: apiKey })).get("/v1/routes/42");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong", reference: "ref-123" });
    expect(JSON.stringify(res.body)).not.toContain("route engine");

    expect(reporter.calls).toHaveLength(1);
    expect(reporter.calls[0]![1]).toEqual({ method: "GET", route: "/v1/routes/:id", status: 500 });

    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toContain("41.12345");
    expect(logs[0]).not.toContain(apiKey);
    expect(logs[0]).not.toContain("/v1/routes/42");
  });

  it("does not report 4xx and does not echo the error message", async () => {
    const reporter = recordingReporter();
    const res = await request(appWith(reporter, [])).get("/v1/forbidden");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Bad request" });
    expect(reporter.calls).toHaveLength(0);
  });

  it("omits the reference when reporting is off", async () => {
    const res = await request(appWith(noopReporter, [])).get("/v1/routes/1");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong" });
  });
});

describe("createApp error handling", () => {
  const app = createApp(loadConfig({ APP_ENV: "unit", APP_VERSION: "test-sha" }));

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("answers malformed JSON with 400 and no parser details", async () => {
    const res = await request(app).post("/healthz").set("Content-Type", "application/json").send('{"lat": 41.1,');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Bad request" });
  });
});
