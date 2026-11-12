import type { RouteRequest, RouteResponse } from "../contracts/route.js";

/** What an engine returns. The router adds `safetyAssumptions`, so every provider reports them the same way. */
export type ProviderRoute = Omit<RouteResponse, "safetyAssumptions">;

/**
 * Result of asking a routing engine for a truck route. Never both a route and reasons.
 * `no_safe_route` covers "engine found nothing" and "engine only found a route that breaks
 * a restriction": the driver must never be shown a route the truck can't use (UC-04).
 */
export type RouteResult =
  | { kind: "ok"; route: ProviderRoute }
  | { kind: "no_safe_route"; reasons: string[] };

/**
 * The internal `routing-service` abstraction (ADR-0001). Callers never talk to a vendor
 * directly, so the engine (HERE today) can be swapped without touching HTTP or the app.
 */
export interface RoutingProvider {
  readonly name: string;
  route(request: RouteRequest): Promise<RouteResult>;
}

/** The engine failed (network, auth, 5xx, unreadable response). Maps to HTTP 502. */
export class RoutingProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "RoutingProviderError";
  }
}

/**
 * A secret value that is only read where it is sent. PR #11's `Secret` class satisfies
 * this shape, so switching config to it needs no change in the routing module.
 */
export interface RevealableSecret {
  reveal(): string;
}
