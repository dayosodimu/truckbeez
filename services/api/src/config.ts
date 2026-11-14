// Runtime configuration comes only from environment variables, so the same
// image runs unchanged in staging, preprod and prod. Secrets are injected at
// deploy time from the environment's secret store, never baked into the image,
// and are held as `Secret` objects that redact themselves (see src/secrets.ts
// and docs/secrets.md).

import { readSecret, type ReadSecretOptions, type Secret } from "./secrets.js";

export type AppEnv = "unit" | "staging" | "preprod" | "prod" | "development";

export interface Secrets {
  databaseUrl?: Secret;
  redisUrl?: Secret;
  /** HERE Routing v8 (ADR-0001). Server-side only: never sent to the app. */
  hereApiKey?: Secret;
  stripeSecretKey?: Secret;
  stripeWebhookSecret?: Secret;
}

export interface Config {
  appEnv: AppEnv;
  port: number;
  version: string;
  stripeMode: "test" | "live";
  secrets: Secrets;
}

const VALID_ENVS: AppEnv[] = ["unit", "staging", "preprod", "prod", "development"];
const DEPLOYED_ENVS: AppEnv[] = ["staging", "preprod", "prod"];

/** Every secret the API reads. docs/secrets.md lists where each one is stored. */
export const SECRET_NAMES = {
  databaseUrl: "DATABASE_URL",
  redisUrl: "REDIS_URL",
  hereApiKey: "HERE_API_KEY",
  stripeSecretKey: "STRIPE_SECRET_KEY",
  stripeWebhookSecret: "STRIPE_WEBHOOK_SECRET",
} as const satisfies Record<keyof Secrets, string>;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  { readFile }: Pick<ReadSecretOptions, "readFile"> = {}
): Config {
  // Fail closed (BR-52 M6): the runtime image sets NODE_ENV=production, so a container
  // started without APP_ENV must not fall back to "development", which skips the
  // placeholder checks, the DB/Redis requirement and (with routing) the HERE key.
  if (env.NODE_ENV === "production" && (!env.APP_ENV || env.APP_ENV === "development")) {
    throw new Error(
      `APP_ENV must be set to staging, preprod or prod when NODE_ENV=production (got ${env.APP_ENV ? `"${env.APP_ENV}"` : "nothing"})`
    );
  }
  const appEnv = (env.APP_ENV ?? "development") as AppEnv;
  if (!VALID_ENVS.includes(appEnv)) {
    throw new Error(`Invalid APP_ENV "${env.APP_ENV}". Expected one of: ${VALID_ENVS.join(", ")}`);
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT "${env.PORT}"`);
  }

  const deployed = DEPLOYED_ENVS.includes(appEnv);
  const secrets = Object.fromEntries(
    Object.entries(SECRET_NAMES).map(([field, name]) => [
      field,
      readSecret(env, name, { rejectPlaceholders: deployed, readFile }),
    ])
  ) as Secrets;

  // Deployed environments must have their data stores configured.
  if (deployed) {
    if (!secrets.databaseUrl) throw new Error(`DATABASE_URL is required when APP_ENV=${appEnv}`);
    if (!secrets.redisUrl) throw new Error(`REDIS_URL is required when APP_ENV=${appEnv}`);
  }

  const stripeMode = env.STRIPE_MODE === "live" ? "live" : "test";
  if (env.STRIPE_MODE && !["test", "live"].includes(env.STRIPE_MODE)) {
    throw new Error(`Invalid STRIPE_MODE "${env.STRIPE_MODE}". Expected test or live`);
  }
  if (stripeMode === "live" && appEnv !== "prod") {
    throw new Error(`STRIPE_MODE=live is only allowed in prod (APP_ENV=${appEnv})`);
  }
  checkStripeKeyMode(secrets.stripeSecretKey, stripeMode);

  return {
    appEnv,
    port,
    version: env.APP_VERSION ?? "dev",
    stripeMode,
    secrets,
  };
}

/** A live Stripe key outside prod (or a test key in prod) is a misconfiguration, not a warning. */
function checkStripeKeyMode(key: Secret | undefined, mode: "test" | "live"): void {
  if (!key) return;
  const value = key.reveal();
  const isLiveKey = /^(sk|rk)_live_/.test(value);
  const isTestKey = /^(sk|rk)_test_/.test(value);
  if (!isLiveKey && !isTestKey) {
    throw new Error("STRIPE_SECRET_KEY is not a Stripe secret or restricted key (sk_/rk_)");
  }
  if (mode === "live" && !isLiveKey) throw new Error("STRIPE_MODE=live needs a live STRIPE_SECRET_KEY");
  if (mode === "test" && !isTestKey) throw new Error("STRIPE_MODE=test needs a test STRIPE_SECRET_KEY");
}
