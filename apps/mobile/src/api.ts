import { MESSAGES, type ApiError, type RouteRequest, type RouteResponse } from '@truckbeez/shared';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL for a device or emulator; the Android emulator reaches
 * the host machine at http://10.0.2.2:4000. The HERE key never lives in the app (BR-4).
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export type PlanRouteResult =
  | { ok: true; route: RouteResponse }
  | { ok: false; status: number; error: ApiError['error'] };

export type PlanRoute = (request: RouteRequest) => Promise<PlanRouteResult>;

export const createPlanRoute =
  (baseUrl: string = API_URL, fetchFn: typeof fetch = fetch): PlanRoute =>
  async (request) => {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}/api/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      return { ok: false, status: 0, error: { code: 'ROUTING_PROVIDER_ERROR', message: MESSAGES.routingProviderError } };
    }

    const body = (await response.json().catch(() => undefined)) as RouteResponse | ApiError | undefined;
    if (response.ok && body && !('error' in body)) {
      return { ok: true, route: body };
    }
    const error =
      body && 'error' in body
        ? body.error
        : { code: 'INTERNAL_ERROR' as const, message: MESSAGES.routingProviderError };
    return { ok: false, status: response.status, error };
  };

export const planRoute: PlanRoute = createPlanRoute();
