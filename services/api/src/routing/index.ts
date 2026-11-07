import type { Config } from "../config.js";
import { createDemoProvider } from "./demoProvider.js";
import { createHereProvider, type HereProviderOptions } from "./hereProvider.js";
import type { RoutingProvider } from "./types.js";

export * from "./types.js";

/** Environments where the straight-line demo route (which ignores restrictions) may be used. */
const DEMO_ROUTING_ENVS: ReadonlyArray<Config["appEnv"]> = ["development", "unit"];

export function createRoutingProvider(
  config: Pick<Config, "appEnv" | "hereApiKey">,
  hereOptions: Omit<HereProviderOptions, "apiKey"> = {}
): RoutingProvider {
  if (config.hereApiKey) {
    return createHereProvider({ ...hereOptions, apiKey: config.hereApiKey });
  }
  if (!DEMO_ROUTING_ENVS.includes(config.appEnv)) {
    // loadConfig already refuses this; kept here so no caller can build a demo router in a deployed env.
    throw new Error(`HERE_API_KEY is required when APP_ENV=${config.appEnv}: the demo route is not truck-safe`);
  }
  return createDemoProvider();
}
