export interface Config {
  port: number;
  isProduction: boolean;
  hereApiKey: string | undefined;
  corsOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const hereApiKey = env.HERE_API_KEY?.trim() || undefined;

  if (isProduction && !hereApiKey) {
    // A production API without real truck routing must not start: the demo route ignores restrictions.
    throw new Error('HERE_API_KEY is required when NODE_ENV=production');
  }

  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return { port, isProduction, hereApiKey, corsOrigins };
}
