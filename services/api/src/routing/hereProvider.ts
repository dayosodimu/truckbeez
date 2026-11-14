import type { RouteInstruction, RouteRequest } from "../contracts/route.js";
import { decodeFlexiblePolyline } from "./flexiblePolyline.js";
import { toHereHazardousGoods } from "./hazmat.js";
import {
  RoutingProviderError,
  type RevealableSecret,
  type RouteResult,
  type RoutingProvider,
} from "./types.js";

/**
 * HERE Routing API v8, truck mode (ADR-0001). `buildHereRouteUrl` and `parseHereResponse`
 * are pure, so every safety rule is unit-tested (test/routing.test.ts, @routing-safety).
 */

export const HERE_ROUTES_URL = "https://router.hereapi.com/v8/routes";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface HereNotice {
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

export interface HereSection {
  polyline?: string;
  summary?: { duration?: number; length?: number };
  actions?: HereAction[];
  notices?: HereNotice[];
}

export interface HereRoutesResponse {
  routes?: { sections?: HereSection[] }[];
  notices?: HereNotice[];
}

/**
 * Rounds up to a whole unit. The value is first snapped to 6 decimals so floating-point
 * noise (4.11 * 100 = 411.00000000000006) doesn't add a phantom unit (BR-47).
 */
export const ceilWhole = (value: number): number => Math.ceil(Math.round(value * 1e6) / 1e6);

const metresToCentimetres = (metres: number): string => String(ceilWhole(metres * 100));

/**
 * Builds the HERE request. Dimensions and weight are rounded UP so the engine never sees
 * a smaller or lighter truck than the real one.
 */
export function buildHereRouteUrl(request: RouteRequest, apiKey: string): URL {
  const { origin, destination, truck } = request;
  const url = new URL(HERE_ROUTES_URL);
  const params = url.searchParams;

  params.set("transportMode", "truck");
  params.set("origin", `${origin.lat},${origin.lng}`);
  params.set("destination", `${destination.lat},${destination.lng}`);
  params.set("return", "polyline,summary,actions,instructions");
  params.set("vehicle[height]", metresToCentimetres(truck.heightM));
  params.set("vehicle[width]", metresToCentimetres(truck.widthM));
  params.set("vehicle[length]", metresToCentimetres(truck.lengthM));
  params.set("vehicle[grossWeight]", String(ceilWhole(truck.grossWeightKg)));
  params.set("vehicle[axleCount]", String(truck.axleCount));

  const goods = toHereHazardousGoods(truck.hazmatClasses);
  if (goods.length > 0) {
    params.set("vehicle[shippedHazardousGoods]", goods.join(","));
  }
  if (truck.tunnelCategory) {
    params.set("vehicle[tunnelCategory]", truck.tunnelCategory);
  }

  params.set("apiKey", apiKey);
  return url;
}

const noticeText = (notice: HereNotice): string => notice.title ?? notice.code ?? "Unknown restriction";

/**
 * Anything not explicitly `info` is critical. HERE adds critical notice codes over time and
 * recommends discarding routes that carry them, so an unknown or missing severity fails safe.
 */
export const isCriticalNotice = (notice: HereNotice): boolean => notice.severity !== "info";

/**
 * Turns a HERE response into a RouteResult.
 * HERE v8 still returns a route when no compliant one exists, flagged only by critical
 * notices (top level or in any section). Those routes are NEVER passed on: they become
 * `no_safe_route` with no geometry (UC-04). A response that cannot be read throws
 * RoutingProviderError (502), never a partial route.
 */
export function parseHereResponse(body: HereRoutesResponse): RouteResult {
  const route = body.routes?.[0];
  const sections = route?.sections ?? [];

  if (!route || sections.length === 0) {
    return { kind: "no_safe_route", reasons: (body.notices ?? []).map(noticeText) };
  }

  const critical = [...(body.notices ?? []), ...sections.flatMap((s) => s.notices ?? [])].filter(isCriticalNotice);
  if (critical.length > 0) {
    return { kind: "no_safe_route", reasons: [...new Set(critical.map(noticeText))] };
  }

  let geometry;
  try {
    geometry = sections.flatMap((section) => {
      if (!section.polyline) throw new Error("route section has no polyline");
      return decodeFlexiblePolyline(section.polyline);
    });
  } catch (error) {
    throw new RoutingProviderError(`HERE response could not be read: ${(error as Error).message}`);
  }

  const instructions: RouteInstruction[] = sections.flatMap((section) =>
    (section.actions ?? []).flatMap((action) =>
      action.instruction
        ? [{ text: action.instruction, distanceM: action.length ?? 0, durationS: action.duration ?? 0 }]
        : []
    )
  );

  return {
    kind: "ok",
    route: {
      geometry,
      distanceM: sections.reduce((total, s) => total + (s.summary?.length ?? 0), 0),
      durationS: sections.reduce((total, s) => total + (s.summary?.duration ?? 0), 0),
      instructions,
      avoidedRestrictions: [],
      isDemo: false,
    },
  };
}

export interface HereProviderOptions {
  apiKey: RevealableSecret;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export function createHereProvider({
  apiKey,
  fetchFn = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: HereProviderOptions): RoutingProvider {
  return {
    name: "here",
    async route(request) {
      let response: Response;
      try {
        response = await fetchFn(buildHereRouteUrl(request, apiKey.reveal()), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // Only the error name: fetch error messages and causes can include the URL, which holds the key.
        throw new RoutingProviderError(`HERE request failed: ${(error as Error).name}`);
      }

      if (!response.ok) {
        // The body is not read or passed on: HERE error bodies can echo the request URL.
        throw new RoutingProviderError(`HERE responded with HTTP ${response.status}`, response.status);
      }

      let body: HereRoutesResponse;
      try {
        body = (await response.json()) as HereRoutesResponse;
      } catch {
        throw new RoutingProviderError("HERE returned a response that is not JSON");
      }
      return parseHereResponse(body);
    },
  };
}
