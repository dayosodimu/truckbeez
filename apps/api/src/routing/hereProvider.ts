import type { RouteInstruction, RouteRequest } from '@truckbeez/shared';
import { decodeFlexiblePolyline } from './flexiblePolyline';
import { toHereHazardousGoods } from './hazmat';
import { RoutingProviderError, type RouteResult, type RoutingProvider } from './types';

const HERE_ROUTES_URL = 'https://router.hereapi.com/v8/routes';
const DEFAULT_TIMEOUT_MS = 10_000;

interface HereNotice {
  title?: string;
  code?: string;
  severity?: string;
}

interface HereAction {
  action?: string;
  instruction?: string;
  duration?: number;
  length?: number;
}

interface HereSection {
  polyline?: string;
  summary?: { duration?: number; length?: number };
  actions?: HereAction[];
  notices?: HereNotice[];
}

interface HereRoutesResponse {
  routes?: { sections?: HereSection[] }[];
  notices?: HereNotice[];
}

export interface HereProviderOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const metresToCentimetres = (metres: number): string => String(Math.ceil(metres * 100));

/** Builds the HERE Routing v8 request. Dimensions are rounded up so the engine never sees a smaller truck. */
export function buildHereRouteUrl(request: RouteRequest, apiKey: string): URL {
  const { origin, destination, truck } = request;
  const url = new URL(HERE_ROUTES_URL);
  const params = url.searchParams;

  params.set('transportMode', 'truck');
  params.set('origin', `${origin.lat},${origin.lng}`);
  params.set('destination', `${destination.lat},${destination.lng}`);
  params.set('return', 'polyline,summary,actions,instructions');
  params.set('vehicle[height]', metresToCentimetres(truck.heightM));
  params.set('vehicle[width]', metresToCentimetres(truck.widthM));
  params.set('vehicle[length]', metresToCentimetres(truck.lengthM));
  params.set('vehicle[grossWeight]', String(Math.ceil(truck.grossWeightKg)));
  params.set('vehicle[axleCount]', String(truck.axleCount));

  const hazardousGoods = toHereHazardousGoods(truck.hazmatClasses);
  if (hazardousGoods.length > 0) {
    params.set('vehicle[shippedHazardousGoods]', hazardousGoods.join(','));
  }
  if (truck.tunnelCategory) {
    params.set('vehicle[tunnelCategory]', truck.tunnelCategory);
  }

  params.set('apikey', apiKey);
  return url;
}

const noticeText = (notice: HereNotice): string => notice.title ?? notice.code ?? 'Unknown restriction';

/**
 * Turns a HERE response into a RouteResult.
 * HERE may return a route that breaks a restriction when no compliant one exists, flagged with
 * critical notices. Those routes are never passed on: they become `no_safe_route` (UC-04).
 */
export function parseHereResponse(body: HereRoutesResponse): RouteResult {
  const route = body.routes?.[0];
  const sections = route?.sections ?? [];

  if (!route || sections.length === 0) {
    return { kind: 'no_safe_route', reasons: (body.notices ?? []).map(noticeText) };
  }

  const criticalNotices = sections
    .flatMap((section) => section.notices ?? [])
    .filter((notice) => notice.severity === 'critical');
  if (criticalNotices.length > 0) {
    return { kind: 'no_safe_route', reasons: criticalNotices.map(noticeText) };
  }

  const geometry = sections.flatMap((section) => {
    if (!section.polyline) {
      throw new RoutingProviderError('HERE route section has no polyline');
    }
    return decodeFlexiblePolyline(section.polyline);
  });

  const instructions: RouteInstruction[] = sections.flatMap((section) =>
    (section.actions ?? [])
      .filter((action) => action.instruction)
      .map((action) => ({
        text: action.instruction as string,
        distanceM: action.length ?? 0,
        durationS: action.duration ?? 0,
      })),
  );

  return {
    kind: 'ok',
    route: {
      geometry,
      distanceM: sections.reduce((total, section) => total + (section.summary?.length ?? 0), 0),
      durationS: sections.reduce((total, section) => total + (section.summary?.duration ?? 0), 0),
      instructions,
      avoidedRestrictions: [],
      isDemo: false,
    },
  };
}

export function createHereProvider({ apiKey, fetchFn = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: HereProviderOptions): RoutingProvider {
  return {
    name: 'here',
    async route(request) {
      let response: Response;
      try {
        response = await fetchFn(buildHereRouteUrl(request, apiKey), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new RoutingProviderError(`HERE request failed: ${(error as Error).message}`);
      }

      if (!response.ok) {
        // Body is not logged: it can echo the request URL, which contains the API key.
        throw new RoutingProviderError(`HERE responded with HTTP ${response.status}`, response.status);
      }

      let body: HereRoutesResponse;
      try {
        body = (await response.json()) as HereRoutesResponse;
      } catch {
        throw new RoutingProviderError('HERE returned a response that is not JSON');
      }
      return parseHereResponse(body);
    },
  };
}
