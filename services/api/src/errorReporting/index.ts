// Crash and error reporting for the API (BR-10), using the Sentry Node SDK (v11).
//
// - Off unless SENTRY_DSN is set. Unit tests and local dev never send anything.
// - environment = APP_ENV, release = APP_VERSION (the git SHA baked in by the
//   Docker build arg), so every issue is tied to the exact image digest deployed.
// - Privacy by construction: the SDK's default integrations are disabled (they
//   would attach request bodies, headers, query strings, console output, outgoing
//   HTTP URLs and stack-frame local variables). Only the integrations listed in
//   `INTEGRATIONS` run, every `dataCollection` category is off, and every event
//   and breadcrumb goes through `scrubEvent` before it leaves the process.
// - No tracing here. Distributed tracing is OpenTelemetry's job (separate ticket).

import * as Sentry from "@sentry/node";
import type { NodeOptions } from "@sentry/node";
import { scrubEvent, secretValuesFromEnv, type ScrubOptions } from "./scrub.js";

export interface ErrorContext {
  /** Low-cardinality tags only (route template, method, status). Never ids, never coordinates. */
  [tag: string]: string | number | undefined;
}

export interface ErrorReporter {
  readonly enabled: boolean;
  /** Report an unexpected error. Returns the event id (safe to show to a user as a support reference). */
  captureException(error: unknown, context?: ErrorContext): string | undefined;
  /** Wait for queued events to be sent (call before exit). */
  flush(timeoutMs?: number): Promise<boolean>;
}

export const noopReporter: ErrorReporter = {
  enabled: false,
  captureException: () => undefined,
  flush: async () => true,
};

/** The SDK surface we use, so tests can inject a fake and inspect the options. */
export type SentrySdk = Pick<typeof Sentry, "init" | "captureException" | "flush">;

/** The only SDK integrations enabled. None of them reads requests, bodies, logs or local variables. */
function integrations() {
  return [
    Sentry.eventFiltersIntegration(),
    Sentry.functionToStringIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.dedupeIntegration(),
    Sentry.onUncaughtExceptionIntegration(),
    Sentry.onUnhandledRejectionIntegration({ mode: "warn" }),
    Sentry.contextLinesIntegration(),
    Sentry.nodeContextIntegration(),
  ];
}

export interface InitOptions {
  sdk?: SentrySdk;
}

/** Build the exact options passed to Sentry.init (exported for tests). */
export function buildSentryOptions(env: NodeJS.ProcessEnv, dsn: string): NodeOptions {
  const scrub: ScrubOptions = { secretValues: secretValuesFromEnv(env) };
  return {
    dsn,
    environment: env.APP_ENV ?? "development",
    release: env.APP_VERSION ?? "dev",
    defaultIntegrations: false,
    integrations: integrations(),
    // v11 collects everything when dataCollection is unset: switch every category off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event, scrub),
    beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb, scrub),
  };
}

/**
 * Initialise error reporting from the environment. Returns a no-op reporter when
 * SENTRY_DSN is unset or empty. An invalid DSN is a configuration error: the
 * message names the variable, never its value.
 *
 * TODO(BR-52 follow-up): read the DSN with readSecret(env, "SENTRY_DSN") from
 * src/secrets.ts once PR #11 is merged (adds SENTRY_DSN_FILE and placeholder checks).
 */
export function initErrorReporting(env: NodeJS.ProcessEnv = process.env, { sdk = Sentry }: InitOptions = {}): ErrorReporter {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return noopReporter;

  if (!isValidDsn(dsn)) {
    throw new Error("SENTRY_DSN is not a valid DSN (expected https://<key>@<host>/<project-id>)");
  }

  sdk.init(buildSentryOptions(env, dsn));

  return {
    enabled: true,
    captureException(error, context = {}) {
      const tags = Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) as Record<
        string,
        string | number
      >;
      return sdk.captureException(error, { tags });
    },
    flush: (timeoutMs = 2000) => sdk.flush(timeoutMs),
  };
}

function isValidDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.username.length > 0 && /\/\d+$/.test(url.pathname);
  } catch {
    return false;
  }
}

export { scrubEvent, scrubString, scrubUrl, secretValuesFromEnv } from "./scrub.js";
