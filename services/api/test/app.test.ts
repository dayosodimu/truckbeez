import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createApp, safeErrorHandler } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { fakeSecret, fakeStripeKey, fakeUrl } from "./helpers/fakeSecrets.js";

describe("api health endpoints", () => {
  const app = createApp(loadConfig({ APP_ENV: "unit", APP_VERSION: "test-sha" }));

  it("GET /healthz returns ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /version reports build and environment", async () => {
    const res = await request(app).get("/version");
    expect(res.body).toEqual({ service: "api", version: "test-sha", env: "unit" });
  });

  it("does not expose the x-powered-by header", async () => {
    const res = await request(app).get("/healthz");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("answers unknown paths with a plain 404", async () => {
    const res = await request(app).get("/.env");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});

describe("loadConfig", () => {
  const deployed = (appEnv: string) => ({
    APP_ENV: appEnv,
    DATABASE_URL: fakeUrl("postgres"),
    REDIS_URL: fakeUrl("rediss"),
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() => loadConfig({ APP_ENV: "qa" })).toThrow(/Invalid APP_ENV/);
  });

  it.each(["staging", "preprod", "prod"])("requires data stores when APP_ENV=%s", (appEnv) => {
    expect(() => loadConfig({ APP_ENV: appEnv })).toThrow(/DATABASE_URL is required/);
    expect(() => loadConfig({ APP_ENV: appEnv, DATABASE_URL: fakeUrl("postgres") })).toThrow(/REDIS_URL is required/);
  });

  it("accepts a fully configured prod environment", () => {
    const cfg = loadConfig({ ...deployed("prod"), PORT: "8080" });
    expect(cfg.port).toBe(8080);
  });

  it.each(["staging", "preprod", "prod"])("refuses placeholder secrets when APP_ENV=%s", (appEnv) => {
    expect(() =>
      loadConfig({ ...deployed(appEnv), DATABASE_URL: "postgres://truckbeez:change-me@postgres:5432/truckbeez" })
    ).toThrow(/DATABASE_URL is still a placeholder/);
    expect(() => loadConfig({ ...deployed(appEnv), HERE_API_KEY: "<here-api-key>" })).toThrow(
      /HERE_API_KEY is still a placeholder/
    );
  });

  it("holds every secret as a redacting Secret, so logging the config leaks nothing", () => {
    const env = {
      ...deployed("prod"),
      HERE_API_KEY: fakeSecret(),
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: fakeStripeKey("live"),
      STRIPE_WEBHOOK_SECRET: fakeSecret("whsec_"),
    };
    const printed = JSON.stringify(loadConfig(env));
    for (const name of ["DATABASE_URL", "REDIS_URL", "HERE_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
      expect(printed).not.toContain(env[name]);
      expect(printed).toContain(`[redacted:${name}]`);
    }
  });

  it("only allows live Stripe in prod, and only with a matching key", () => {
    expect(() => loadConfig({ ...deployed("staging"), STRIPE_MODE: "live" })).toThrow(/only allowed in prod/);
    expect(() =>
      loadConfig({ ...deployed("prod"), STRIPE_MODE: "live", STRIPE_SECRET_KEY: fakeStripeKey("test") })
    ).toThrow(/needs a live STRIPE_SECRET_KEY/);
    expect(() =>
      loadConfig({ ...deployed("staging"), STRIPE_MODE: "test", STRIPE_SECRET_KEY: fakeStripeKey("live") })
    ).toThrow(/needs a test STRIPE_SECRET_KEY/);
    expect(() => loadConfig({ APP_ENV: "development", STRIPE_SECRET_KEY: fakeSecret() })).toThrow(/not a Stripe/);
  });

  it("error messages name the variable but never contain the value", () => {
    const leakedKey = fakeStripeKey("live");
    try {
      loadConfig({ ...deployed("staging"), STRIPE_SECRET_KEY: leakedKey });
    } catch (err) {
      expect((err as Error).message).not.toContain(leakedKey);
      return;
    }
    throw new Error("expected loadConfig to throw");
  });
});

describe("safeErrorHandler", () => {
  it("returns a generic error and logs the detail with secrets redacted", async () => {
    const key = fakeSecret();
    const config = loadConfig({ APP_ENV: "unit", HERE_API_KEY: key });
    const logs: string[] = [];

    const app = express();
    app.get("/boom", () => {
      throw new Error(`upstream failed: https://router.hereapi.com/v8/routes?apiKey=${key}`);
    });
    app.use(safeErrorHandler(config, (line) => logs.push(line)));

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong." });
    expect(JSON.stringify(res.body)).not.toContain(key);
    expect(logs.join("\n")).toContain("upstream failed");
    expect(logs.join("\n")).not.toContain(key);
  });
});
