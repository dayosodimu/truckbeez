// Runtime configuration comes only from environment variables, so the same
// image runs unchanged in staging, preprod and prod. Secrets are injected at
// deploy time from the environment's secret store, never baked into the image.

import type { RevealableSecret } from "./routing/types.js";

export type AppEnv = "unit" | "staging" | "preprod" | "prod" | "development";

export interface Config {
  appEnv: AppEnv;
  port: number;
  version: string;
  databaseUrl?: string;
  redisUrl?: string;
  /** HERE Routing v8 (ADR-0001). Server-side only: never logged, never sent to the app. */
  hereApiKey?: RevealableSecret;
}

const VALID_ENVS: AppEnv[] = ["unit", "staging", "preprod", "prod", "development"];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appEnv = (env.APP_ENV ?? "development") as AppEnv;
  if (!VALID_ENVS.includes(appEnv)) {
    throw new Error(`Invalid APP_ENV "${env.APP_ENV}". Expected one of: ${VALID_ENVS.join(", ")}`);
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT "${env.PORT}"`);
  }

  // Deployed environments must have their data stores configured.
  if (["staging", "preprod", "prod"].includes(appEnv)) {
    for (const key of ["DATABASE_URL", "REDIS_URL"]) {
      if (!env[key]) throw new Error(`${key} is required when APP_ENV=${appEnv}`);
    }
  }

  const hereApiKey = readHereApiKey(env);
  // The demo route ignores every truck restriction, so deployed environments must route with HERE.
  if (["staging", "preprod", "prod"].includes(appEnv) && !hereApiKey) {
    throw new Error(`HERE_API_KEY is required when APP_ENV=${appEnv}: the demo route is not truck-safe`);
  }

  return {
    appEnv,
    port,
    version: env.APP_VERSION ?? "dev",
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    hereApiKey,
  };
}

/**
 * Reads HERE_API_KEY from the environment only. Interim until PR #11 (BR-52) lands; then
 * this becomes `readSecret(env, "HERE_API_KEY", ...)` and `Secret` satisfies RevealableSecret,
 * so nothing in src/routing changes. The value prints as "[redacted:HERE_API_KEY]".
 */
function readHereApiKey(env: NodeJS.ProcessEnv): RevealableSecret | undefined {
  const value = env.HERE_API_KEY?.trim();
  if (!value) return undefined;
  const redacted = "[redacted:HERE_API_KEY]";
  return {
    reveal: () => value,
    toString: () => redacted,
    toJSON: () => redacted,
    [Symbol.for("nodejs.util.inspect.custom")]: () => redacted,
  } as RevealableSecret;
}
