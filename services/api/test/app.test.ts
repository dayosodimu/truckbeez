import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { inspect } from "node:util";
import { loadConfig } from "../src/config.js";
import { fakeSecret } from "./helpers/fakeSecrets.js";

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
});

describe("loadConfig", () => {
  it("rejects an unknown APP_ENV", () => {
    expect(() => loadConfig({ APP_ENV: "qa" })).toThrow(/Invalid APP_ENV/);
  });

  it.each(["staging", "preprod", "prod"])("requires data stores when APP_ENV=%s", (appEnv) => {
    expect(() => loadConfig({ APP_ENV: appEnv })).toThrow(/DATABASE_URL is required/);
    expect(() => loadConfig({ APP_ENV: appEnv, DATABASE_URL: "postgres://x" })).toThrow(/REDIS_URL is required/);
  });

  it("accepts a fully configured prod environment", () => {
    const cfg = loadConfig({
      APP_ENV: "prod",
      DATABASE_URL: "postgres://x",
      REDIS_URL: "redis://y",
      HERE_API_KEY: fakeSecret(),
      PORT: "8080",
    });
    expect(cfg.port).toBe(8080);
  });

  it.each(["staging", "preprod", "prod"])("@routing-safety requires HERE_API_KEY when APP_ENV=%s", (appEnv) => {
    const stores = { DATABASE_URL: "postgres://x", REDIS_URL: "redis://y" };
    expect(() => loadConfig({ APP_ENV: appEnv, ...stores })).toThrow(/HERE_API_KEY is required/);
    expect(() => loadConfig({ APP_ENV: appEnv, ...stores, HERE_API_KEY: "  " })).toThrow(/HERE_API_KEY is required/);
  });

  it("does not require HERE_API_KEY in development or unit", () => {
    expect(loadConfig({ APP_ENV: "development" }).hereApiKey).toBeUndefined();
    expect(loadConfig({ APP_ENV: "unit" }).hereApiKey).toBeUndefined();
  });

  it("keeps the HERE key out of logs and JSON", () => {
    const key = fakeSecret();
    const cfg = loadConfig({ APP_ENV: "development", HERE_API_KEY: key });
    expect(cfg.hereApiKey?.reveal()).toBe(key);
    for (const printed of [JSON.stringify(cfg), inspect(cfg), String(cfg.hereApiKey), `${cfg.hereApiKey}`]) {
      expect(printed).not.toContain(key);
    }
  });
});
