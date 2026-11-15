import type { LatLng, RouteOutcome, TruckProfile } from "../types.js";
import { decodeFlexiblePolyline } from "./flexiblePolyline.js";

/**
 * Pure HERE Routing v8 request/response handling. No network, no environment access,
 * so every safety rule here is unit-tested (see test/routing.test.ts, @routing-safety).
 * ADR-0001 (docs/adr/0001-truck-routing-engine.md) explains why these rules exist.
 */

export const HERE_ROUTES_URL = "https://router.hereapi.com/v8/routes";

/**
 * Every value HERE Routing v8 accepts for `vehicle[shippedHazardousGoods]`.
 * The driver app must offer exactly these (apps/mobile/src/hazmat.ts, BR-58);
 * test/hazmat-options.test.ts fails if they differ.
 */
export const HERE_HAZARDOUS_GOODS = [
  "combustible",
  "corrosive",
  "explosive",
  "flammable",
  "gas",
  "harmfulToWater",
  "organic",
  "other",
  "poison",
  "poisonousInhalation",
  "radioactive",
] as const;
export type HereHazardousGood = (typeof HERE_HAZARDOUS_GOODS)[number];

/** ADR tunnel restriction codes. HERE routes only through tunnels less strict than this. */
export const TUNNEL_CATEGORIES = ["B", "C", "D", "E"] as const;
export type TunnelCategory = (typeof TUNNEL_CATEGORIES)[number];

export const NO_SAFE_ROUTE_MESSAGE = "No truck-safe route found for this vehicle.";

/**
 * Rounds up to a whole unit. The value is first snapped to 6 decimals so floating-point noise
 * (411.00000000000006) doesn't add a phantom unit (BR-47).
 */
export const ceilWhole = (value: number): number => Math.ceil(Math.round(value * 1e6) / 1e6);

/**
 * Builds the HERE Routing v8 request. Dimensions and weight are rounded UP so the engine
 * never sees a smaller or lighter truck than the real one.
 */
export function buildHereRouteUrl(
  origin: LatLng,
  destination: LatLng,
  profile: TruckProfile,
  apiKey: string
): URL {
  const url = new URL(HERE_ROUTES_URL);
  const params = url.searchParams;

  params.set("transportMode", "truck");
  params.set("origin", `${origin.lat},${origin.lng}`);
  params.set("destination", `${destination.lat},${destination.lng}`);
  params.set("return", "polyline,summary,actions,instructions");
  params.set("vehicle[height]", String(ceilWhole(profile.heightCm)));
  params.set("vehicle[width]", String(ceilWhole(profile.widthCm)));
  params.set("vehicle[length]", String(ceilWhole(profile.lengthCm)));
  params.set("vehicle[grossWeight]", String(ceilWhole(profile.grossWeightKg)));
  params.set("vehicle[axleCount]", String(profile.axleCount));

  const goods = [...new Set(profile.hazmat)].sort();
  if (goods.length > 0) {
    params.set("vehicle[shippedHazardousGoods]", goods.join(","));
  }
  if (profile.tunnelCategory) {
    params.set("vehicle[tunnelCategory]", profile.tunnelCategory);
  }

  params.set("apiKey", apiKey);
  return url;
}

export interface HereNotice {
  title?: string;
  code?: string;
  severity?: string;
}

interface HereAction {
  instruction?: string;
}

interface HereSection {
  polyline?: string;
  summary?: { duration?: number; length?: number };
  actions?: HereAction[];
  notices?: HereNotice[];
}

export interface HereRoutesResponse {
  routes?: { sections?: HereSection[] }[];
  notices?: HereNotice[];
}

const noticeText = (notice: HereNotice): string =>
  notice.title ?? notice.code ?? "Unknown restriction";

/**
 * Anything that is not explicitly `info` is treated as critical. HERE can add new critical
 * notice codes over time and recommends discarding routes that carry them, so an unknown
 * or missing severity must fail safe.
 */
const isCritical = (notice: HereNotice): boolean => notice.severity !== "info";

/**
 * Turns a HERE response into a RouteOutcome.
 * HERE v8 still returns a route when no compliant one exists, flagged only by critical
 * notices. Those routes are NEVER passed on: they become `no_safe_route` (UC-04).
 */
export function parseHereRoute(body: HereRoutesResponse): RouteOutcome {
  const route = body.routes?.[0];
  const sections = route?.sections ?? [];

  if (!route || sections.length === 0) {
    return { kind: "no_safe_route", reasons: (body.notices ?? []).map(noticeText) };
  }

  const critical = [...(body.notices ?? []), ...sections.flatMap((s) => s.notices ?? [])].filter(
    isCritical
  );
  if (critical.length > 0) {
    return { kind: "no_safe_route", reasons: [...new Set(critical.map(noticeText))] };
  }

  const coordinates = sections.flatMap((section) => {
    if (!section.polyline) throw new Error("HERE route section has no polyline");
    return decodeFlexiblePolyline(section.polyline);
  });

  return {
    kind: "ok",
    route: {
      provider: "here",
      distanceM: sections.reduce((total, s) => total + (s.summary?.length ?? 0), 0),
      durationS: sections.reduce((total, s) => total + (s.summary?.duration ?? 0), 0),
      coordinates,
      instructions: sections.flatMap((s) =>
        (s.actions ?? []).flatMap((a) => (a.instruction ? [a.instruction] : []))
      ),
    },
  };
}
