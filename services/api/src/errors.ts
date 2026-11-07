import type { ErrorRequestHandler, RequestHandler } from "express";
import { noopReporter, scrubString, secretValuesFromEnv, type ErrorReporter } from "./errorReporting/index.js";

/** 404 for anything no route matched. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

/** HTTP status carried by an error (http-errors / body-parser style), if it is a client error. */
function clientStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown } | null;
  const status = typeof e?.status === "number" ? e.status : typeof e?.statusCode === "number" ? e.statusCode : undefined;
  return status !== undefined && status >= 400 && status < 500 ? status : undefined;
}

/**
 * Last Express middleware. Clients get a generic message and, for server errors,
 * a `reference` (the error-tracker event id) they can quote to support. Never a
 * stack trace, error message, request echo or config value.
 *
 * - 4xx (bad JSON, payload too large, ...): not reported; they are client mistakes.
 * - 5xx and anything without a status: reported to the error tracker (scrubbed in
 *   errorReporting/scrub.ts) and logged as one JSON line without coordinates or secrets.
 *
 * Note for BR-52 (PR #11): that PR adds `safeErrorHandler` in app.ts with the same
 * client contract. When both land, keep one handler: this one, with its log line
 * passed through `redact()` from secrets.ts.
 */
export function errorHandler(
  reporter: ErrorReporter = noopReporter,
  log: (line: string) => void = (line) => console.error(line),
  env: NodeJS.ProcessEnv = process.env
): ErrorRequestHandler {
  const secretValues = secretValuesFromEnv(env);
  return (err, req, res, next) => {
    // Response already started: let Express close the connection.
    if (res.headersSent) return next(err);

    const status = clientStatus(err) ?? 500;
    if (status < 500) {
      res.status(status).json({ error: status === 404 ? "Not found" : "Bad request" });
      return;
    }

    // Route template (e.g. /v1/routes/:id), never the raw URL, which can carry ids or coordinates.
    const route = typeof req.route?.path === "string" ? req.route.path : undefined;
    const reference = reporter.captureException(err, { method: req.method, route, status });

    const name = err instanceof Error ? err.name : typeof err;
    const message = err instanceof Error ? scrubString(err.message, { secretValues }) : undefined;
    log(JSON.stringify({ msg: "request failed", status, method: req.method, route, error: name, message, reference }));

    res.status(500).json(reference ? { error: "Something went wrong", reference } : { error: "Something went wrong" });
  };
}
