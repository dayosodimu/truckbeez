import type { RouteRequest } from '@truckbeez/shared';

export const routeRequest: RouteRequest = {
  origin: { lat: 40.7357, lng: -74.1724 },
  destination: { lat: 39.9526, lng: -75.1652 },
  truck: {
    heightM: 4.11,
    widthM: 2.6,
    lengthM: 21.3,
    grossWeightKg: 36_287,
    axleCount: 5,
    hazmatClasses: [],
  },
};

/** HERE's published flexible-polyline example (4 points in Frankfurt). */
export const EXAMPLE_POLYLINE = 'BFoz5xJ67i1B1B7PzIhaxL7Y';

export const hereRouteBody = {
  routes: [
    {
      id: 'route-1',
      sections: [
        {
          id: 'section-1',
          type: 'vehicle',
          polyline: EXAMPLE_POLYLINE,
          summary: { duration: 8040, length: 186_000 },
          actions: [
            { action: 'depart', instruction: 'Head east on Market St.', duration: 60, length: 400 },
            { action: 'arrive', instruction: 'Arrive at your destination.', duration: 0, length: 0 },
          ],
        },
      ],
    },
  ],
};
