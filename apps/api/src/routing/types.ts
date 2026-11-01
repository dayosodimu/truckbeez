import type { RouteRequest, RouteResponse } from '@truckbeez/shared';

/**
 * Result of asking a routing engine for a truck route.
 * `no_safe_route` covers both "engine found nothing" and "engine only found a route
 * that breaks a restriction": the app must never be shown a route the truck can't use (UC-04).
 */
export type RouteResult =
  | { kind: 'ok'; route: RouteResponse }
  | { kind: 'no_safe_route'; reasons: string[] };

/**
 * The internal `routing-service` abstraction. Callers never talk to a vendor SDK directly,
 * so the engine (HERE today) can be swapped without touching the HTTP layer or the app.
 */
export interface RoutingProvider {
  readonly name: string;
  route(request: RouteRequest): Promise<RouteResult>;
}

/** The engine failed (network, auth, 5xx, malformed response). Maps to HTTP 502. */
export class RoutingProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RoutingProviderError';
  }
}
