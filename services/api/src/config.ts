// Runtime configuration comes only from environment variables, so the same
// image runs unchanged in staging, preprod and prod. Secrets are injected at
// deploy time from the environment's secret store, never baked into the image.

export type AppEnv = "unit" | "staging" | "preprod" | "prod" | "development";

export interface Config {
  appEnv: AppEnv;
  port: number;
  version: string;
  databaseUrl?: string;
  redisUrl?: string;
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

  return {
    appEnv,
    port,
    version: env.APP_VERSION ?? "dev",
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
  };
}
