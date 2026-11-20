import type { LatLng, RouteOutcome, RouteResult, TruckProfile } from "../types.js";
import { buildHereRouteUrl, parseHereRoute, type HereRoutesResponse } from "./hereRouting.js";
import { distanceKm } from "./store.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/** The routing provider failed (network, HTTP error, bad body). Not the same as "no safe route". */
export class RoutingProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "RoutingProviderError";
  }
}

export interface RoutingOptions {
  apiKey?: string;
  nodeEnv?: string;
  allowDemoRoute?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

type RoutingEnv = { NODE_ENV?: string; HERE_API_KEY?: string; ALLOW_DEMO_ROUTE?: string };

/**
 * The straight-line demo route ignores every truck restriction, so it is opt-in, never the
 * default: only NODE_ENV=development|test or ALLOW_DEMO_ROUTE=true may use it. Staging,
 * preprod, an unset or misspelled NODE_ENV: no key means the server refuses (BR-51-S1).
 */
export function isDemoRouteAllowed(env: RoutingEnv): boolean {
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.ALLOW_DEMO_ROUTE === "true";
}

export function assertRoutingConfigured(env: RoutingEnv): void {
  if (!env.HERE_API_KEY && !isDemoRouteAllowed(env)) {
    throw new Error(
      "HERE_API_KEY is required: the demo route is not truck-safe. For local development set ALLOW_DEMO_ROUTE=true."
    );
  }
}

/**
 * Truck-safe routing with HERE Routing API v8 (ADR-0001).
 * Without a key, only explicitly allowed local/test environments get the demo route.
 */
export async function getTruckRoute(
  origin: LatLng,
  destination: LatLng,
  profile: TruckProfile,
  {
    apiKey = process.env.HERE_API_KEY,
    nodeEnv = process.env.NODE_ENV,
    allowDemoRoute = process.env.ALLOW_DEMO_ROUTE,
    fetchFn = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: RoutingOptions = {}
): Promise<RouteOutcome> {
  if (!apiKey) {
    assertRoutingConfigured({ NODE_ENV: nodeEnv, HERE_API_KEY: apiKey, ALLOW_DEMO_ROUTE: allowDemoRoute });
    return { kind: "ok", route: demoRoute(origin, destination) };
  }

  let response: Response;
  try {
    response = await fetchFn(buildHereRouteUrl(origin, destination, profile, apiKey), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new RoutingProviderError(`HERE request failed: ${(error as Error).name}`);
  }

  if (!response.ok) {
    // The body is not read or passed on: HERE error bodies can echo the request URL,
    // which contains the API key.
    throw new RoutingProviderError(`HERE responded with HTTP ${response.status}`, response.status);
  }

  let body: HereRoutesResponse;
  try {
    body = (await response.json()) as HereRoutesResponse;
  } catch {
    throw new RoutingProviderError("HERE returned a response that is not JSON");
  }

  try {
    return parseHereRoute(body);
  } catch (error) {
    throw new RoutingProviderError(`HERE response could not be read: ${(error as Error).message}`);
  }
}

function demoRoute(origin: LatLng, destination: LatLng): RouteResult {
  const km = distanceKm(origin, destination);
  return {
    provider: "demo",
    distanceM: Math.round(km * 1000),
    durationS: Math.round((km / 70) * 3600), // assume 70 km/h average
    coordinates: [origin, destination],
    instructions: ["Demo route: add HERE_API_KEY to the server for real truck routing."],
  };
}
