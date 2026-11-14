import express, { type ErrorRequestHandler, type Express } from "express";
import type { Config } from "./config.js";
import { redact } from "./secrets.js";

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

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(safeErrorHandler(config));
  return app;
}

/**
 * Clients get a generic message and never a stack trace, upstream response body or
 * config value. The server log keeps the detail, with every known secret redacted.
 */
export function safeErrorHandler(
  config: Config,
  log: (line: string) => void = (line) => console.error(line)
): ErrorRequestHandler {
  const secrets = Object.values(config.secrets);
  return (err, _req, res, _next) => {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    // body-parser errors (err.type such as "entity.parse.failed") put the request body in
    // err.message, e.g. Node's JSON.parse quotes it. Log only the type (BR-52 L3).
    const bodyParserType = typeof err?.type === "string" && typeof err?.status === "number" ? err.type : undefined;
    if (bodyParserType) {
      log(JSON.stringify({ msg: "request failed", status, type: bodyParserType }));
    } else {
      const detail = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
      log(JSON.stringify({ msg: "request failed", status, error: redact(detail, secrets) }));
    }
    res.status(status).json({ error: status === 500 ? "Something went wrong." : "Bad request." });
  };
}
