import express, { type Express } from "express";
import type { Config } from "./config.js";

export function createApp(config: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  // Liveness: the process is up. Used by the container HEALTHCHECK.
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness/version: used by deploy scripts to confirm the right build is live.
  app.get("/version", (_req, res) => {
    res.json({ service: "api", version: config.version, env: config.appEnv });
  });

  return app;
}
