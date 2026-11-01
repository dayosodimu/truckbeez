import { z } from 'zod';
import { truckProfileSchema } from './truckProfile';

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

/** Body of `POST /api/route` (UC-03). The truck profile is required on every request. */
export const routeRequestSchema = z.object({
  origin: latLngSchema,
  destination: latLngSchema,
  truck: truckProfileSchema,
});
export type RouteRequest = z.infer<typeof routeRequestSchema>;

export interface RouteInstruction {
  text: string;
  distanceM: number;
  durationS: number;
}

/** Success body of `POST /api/route`. */
export interface RouteResponse {
  geometry: LatLng[];
  distanceM: number;
  durationS: number;
  instructions: RouteInstruction[];
  /** Restrictions the route avoided, for the "Low bridge on Main St avoided" notice (UC-03 step 8). */
  avoidedRestrictions: string[];
  /** True when the API had no routing key and drew a straight line (development only). */
  isDemo: boolean;
}

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'NO_SAFE_ROUTE'
  | 'ROUTING_PROVIDER_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Driver-facing messages, worded as in UC-03 and UC-04. */
export const MESSAGES = {
  invalidRequest: "Couldn't plan a route. Check your truck details.",
  noSafeRoute: 'No truck-safe route found for this vehicle.',
  routingProviderError: "Couldn't reach the routing service. Try again.",
  demoRouteSuffix: '(demo route)',
} as const;

/** Formats an ETA card line, e.g. "2 h 14 min · 186 km". */
export function formatEta(durationS: number, distanceM: number): string {
  const totalMinutes = Math.max(0, Math.round(durationS / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time = hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;

  const km = distanceM / 1000;
  const distance = km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;

  return `${time} · ${distance}`;
}
