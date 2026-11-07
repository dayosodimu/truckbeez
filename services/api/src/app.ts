import express, { type Express } from "express";
import type { Config } from "./config.js";
import { createRoutingProvider, type RoutingProvider } from "./routing/index.js";
import { createRouteRouter, type RouteLogger } from "./routing/router.js";

export interface AppDeps {
  /** Defaults to HERE when HERE_API_KEY is set, else the demo route (development/unit only). */
  routingProvider?: RoutingProvider;
  logger?: RouteLogger;
}

export function createApp(config: Config, deps: AppDeps = {}): Express {
  const routingProvider = deps.routingProvider ?? createRoutingProvider(config);
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

  // Truck-safe routing (UC-03 / UC-04, ADR-0001).
  app.use("/api/route", createRouteRouter(routingProvider, deps.logger));

  return app;
}
