import express, { type Express } from "express";
import type { Config } from "./config.js";
import { noopReporter, type ErrorReporter } from "./errorReporting/index.js";
import { errorHandler, notFoundHandler } from "./errors.js";

export interface AppDeps {
  /** Error tracker (Sentry when SENTRY_DSN is set, otherwise a no-op). */
  reporter?: ErrorReporter;
}

export function createApp(config: Config, { reporter = noopReporter }: AppDeps = {}): Express {
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

  // Keep these two last: unmatched routes, then the error path (reports 5xx, never leaks details).
  app.use(notFoundHandler);
  app.use(errorHandler(reporter));
  return app;
}
