import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

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
    const cfg = loadConfig({ APP_ENV: "prod", DATABASE_URL: "postgres://x", REDIS_URL: "redis://y", PORT: "8080" });
    expect(cfg.port).toBe(8080);
  });
});
