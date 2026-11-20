import { randomBytes } from "node:crypto";
import type { HereNotice, HereRoutesResponse } from "../src/lib/hereRouting.js";
import type { LatLng, TruckProfile } from "../src/types.js";

export const NEWARK: LatLng = { lat: 40.7357, lng: -74.1724 };
export const PHILADELPHIA: LatLng = { lat: 39.9526, lng: -75.1652 };

/** A typical US tractor-trailer: 13'6" tall, 8'6" wide, 70 ft long, 80,000 lb. */
export const DRY_VAN: TruckProfile = {
  heightCm: 411.48,
  widthCm: 259.08,
  lengthCm: 2133.6,
  grossWeightKg: 36287.39,
  axleCount: 5,
  hazmat: [],
};

/** HERE's published flexible-polyline example (4 points in Frankfurt). */
export const EXAMPLE_POLYLINE = "BFoz5xJ67i1B1B7PzIhaxL7Y";

export const compliantRoute = (notices: HereNotice[] = []): HereRoutesResponse => ({
  routes: [
    {
      sections: [
        {
          polyline: EXAMPLE_POLYLINE,
          summary: { duration: 8040, length: 186_000 },
          actions: [
            { instruction: "Head east on Market St." },
            { instruction: "Arrive at your destination." },
          ],
          notices,
        },
      ],
    },
  ],
});

/** The shape HERE uses when the only route it found breaks a restriction. */
export const violatingRoute = (notice: HereNotice): HereRoutesResponse => compliantRoute([notice]);

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Mock API key, generated fresh each run. Never write a key literal in a test, not even
 * "test-key" (docs/secrets.md); the repo's secret scanner rejects them.
 */
export const fakeSecret = (prefix = ""): string => `${prefix}${randomBytes(24).toString("hex")}`;
