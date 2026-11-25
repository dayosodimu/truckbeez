import type { ApiError, RouteRequest, RouteResponse, SafetyAssumption } from '@truckbeez/shared';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL for a device or emulator (the Android emulator reaches
 * the host at http://10.0.2.2:3000). The app never holds a routing key: HERE is server-side only.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** BR-31: a request with no answer within this time is treated as offline. */
export const ROUTE_TIMEOUT_MS = 15_000;

/**
 * Every outcome of `POST /api/route`, mapped to exactly one screen state (BR-31 §7):
 * - `route`: a route to draw
 * - `noSafeRoute`: 422 (a fact about the roads); never any geometry
 * - `unavailable`: 5xx or an unreadable answer (our system); never a guessed route
 * - `offline`: no answer at all
 * - `invalid`: 400 (the app sent something the API rejects; shouldn't happen after local checks)
 */
export type PlanRouteResult =
  | { kind: 'route'; route: RouteResponse }
  | { kind: 'noSafeRoute'; reasons: string[]; safetyAssumptions: SafetyAssumption[] }
  | { kind: 'unavailable'; status: number }
  | { kind: 'offline' }
  | { kind: 'invalid' };

export type PlanRoute = (request: RouteRequest) => Promise<PlanRouteResult>;

const isLatLng = (p: unknown): boolean =>
  typeof p === 'object' && p !== null && Number.isFinite((p as { lat: unknown }).lat) && Number.isFinite((p as { lng: unknown }).lng);

/** A 200 body is only drawn if it really is a route; anything else is "unavailable", not a route. */
function asRoute(body: unknown): RouteResponse | undefined {
  const r = body as Partial<RouteResponse> | undefined;
  if (!r || !Array.isArray(r.geometry) || r.geometry.length < 2 || !r.geometry.every(isLatLng)) return undefined;
  if (!Number.isFinite(r.distanceM) || !Number.isFinite(r.durationS)) return undefined;
  return {
    ...(r as RouteResponse),
    safetyAssumptions: Array.isArray(r.safetyAssumptions) ? r.safetyAssumptions : [],
    avoidedRestrictions: Array.isArray(r.avoidedRestrictions) ? r.avoidedRestrictions : [],
    instructions: Array.isArray(r.instructions) ? r.instructions : [],
  };
}

export function createPlanRoute(
  baseUrl: string = API_URL,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = ROUTE_TIMEOUT_MS
): PlanRoute {
  return async (request) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}/api/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      return { kind: 'offline' };
    } finally {
      clearTimeout(timer);
    }

    const body: unknown = await response.json().catch(() => undefined);
    if (response.status === 200) {
      const route = asRoute(body);
      return route ? { kind: 'route', route } : { kind: 'unavailable', status: response.status };
    }
    if (response.status === 422) {
      const details = (body as ApiError | undefined)?.error?.details as
        | { reasons?: unknown; safetyAssumptions?: unknown }
        | undefined;
      const reasons = Array.isArray(details?.reasons) ? details.reasons.filter((r): r is string => typeof r === 'string') : [];
      const safetyAssumptions = Array.isArray(details?.safetyAssumptions) ? (details.safetyAssumptions as SafetyAssumption[]) : [];
      return { kind: 'noSafeRoute', reasons, safetyAssumptions };
    }
    if (response.status === 400) return { kind: 'invalid' };
    return { kind: 'unavailable', status: response.status };
  };
}

export const planRoute: PlanRoute = createPlanRoute();
