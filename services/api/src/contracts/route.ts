import { z } from "zod";

/**
 * API contracts for `POST /api/route` (UC-03, UC-04).
 *
 * ADR-0003 step A keeps these inside the API; step B moves this file unchanged to
 * `packages/shared` so the mobile app validates the same schemas.
 *
 * Units are metric on the wire (metres, kilograms); the app converts for display.
 */

/** UN hazard classes 1–9. */
export const HAZMAT_CLASS_LABELS = {
  1: "Explosives",
  2: "Gases",
  3: "Flammable liquids",
  4: "Flammable solids",
  5: "Oxidizers & organic peroxides",
  6: "Toxic & infectious substances",
  7: "Radioactive material",
  8: "Corrosives",
  9: "Miscellaneous dangerous goods",
} as const;

export type HazmatClass = keyof typeof HAZMAT_CLASS_LABELS;

export const HAZMAT_CLASSES = Object.keys(HAZMAT_CLASS_LABELS).map(Number) as HazmatClass[];

/** An unknown class is rejected, never dropped: dropping it would route the truck as if it carried nothing. */
export const hazmatClassSchema = z
  .number()
  .int()
  .min(1)
  .max(9)
  .transform((n) => n as HazmatClass);

/** ADR tunnel restriction code. B is the most restrictive, E the least. */
export const TUNNEL_CATEGORIES = ["B", "C", "D", "E"] as const;
export const tunnelCategorySchema = z.enum(TUNNEL_CATEGORIES);
export type TunnelCategory = z.infer<typeof tunnelCategorySchema>;

/**
 * Sent with every route request. `strict()` rejects unknown keys, so a client sending the
 * old `hazmat: [...]` or `heightCm` fields gets a 400 instead of a non-hazmat route.
 * `hazmatClasses` is required (send `[]` for none): a missing field must not mean "no hazmat".
 */
export const truckProfileSchema = z
  .object({
    heightM: z.number().positive().max(6),
    widthM: z.number().positive().max(5),
    lengthM: z.number().positive().max(50),
    grossWeightKg: z.number().positive().max(200_000),
    axleCount: z.number().int().min(2).max(20),
    hazmatClasses: z
      .array(hazmatClassSchema)
      .max(9)
      .refine((classes) => new Set(classes).size === classes.length, {
        message: "Hazmat classes must not repeat",
      }),
    tunnelCategory: tunnelCategorySchema.optional(),
  })
  .strict();

export type TruckProfile = z.infer<typeof truckProfileSchema>;

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

/** Body of `POST /api/route`. The full truck profile is required on every request. */
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
  /** True for the straight-line development route, which ignores every restriction. */
  isDemo: boolean;
}

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "NO_SAFE_ROUTE"
  | "ROUTING_PROVIDER_ERROR"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

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
  noSafeRoute: "No truck-safe route found for this vehicle.",
  routingProviderError: "Couldn't reach the routing service. Try again.",
  demoRouteSuffix: "(demo route)",
} as const;
