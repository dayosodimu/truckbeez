import type { LatLng, RouteRequest, TruckProfile } from "../../src/contracts/route.js";
import type { HereNotice, HereRoutesResponse } from "../../src/routing/hereProvider.js";
import type { RevealableSecret } from "../../src/routing/types.js";
import { fakeSecret } from "./fakeSecrets.js";

export const NEWARK: LatLng = { lat: 40.7357, lng: -74.1724 };
export const PHILADELPHIA: LatLng = { lat: 39.9526, lng: -75.1652 };

/** A typical US tractor-trailer: 13'6" tall, 8'6" wide, 70 ft long, 80,000 lb. */
export const DRY_VAN: TruckProfile = {
  heightM: 4.1148,
  widthM: 2.5908,
  lengthM: 21.336,
  grossWeightKg: 36287.39,
  axleCount: 5,
  hazmatClasses: [],
};

export const routeRequest = (truck: TruckProfile = DRY_VAN): RouteRequest => ({
  origin: NEWARK,
  destination: PHILADELPHIA,
  truck,
});

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
            { instruction: "Head east on Market St.", length: 400, duration: 60 },
            { action: "depart" },
            { instruction: "Arrive at your destination.", length: 0, duration: 0 },
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

export const fetchReturning = (response: Response) => (async () => response) as unknown as typeof fetch;

/** A generated HERE key wrapped like config's: never a literal (docs/secrets.md). */
export const fakeHereKey = (): RevealableSecret & { value: string } => {
  const value = fakeSecret();
  return { value, reveal: () => value };
};
