import { MESSAGES, type LatLng } from '@truckbeez/shared';
import type { RoutingProvider } from './types';

const EARTH_RADIUS_M = 6_371_000;
const DEMO_SPEED_M_PER_S = 80_000 / 3600; // 80 km/h
const DEMO_POINTS = 20;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineDistanceM(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Development-only provider used when no HERE key is configured (UC-03 alternate flow 4b).
 * It draws a straight line and ignores every truck restriction, so the response is always
 * marked `isDemo` and config refuses to start production without a real key.
 */
export function createDemoProvider(): RoutingProvider {
  return {
    name: 'demo',
    async route({ origin, destination }) {
      const geometry = Array.from({ length: DEMO_POINTS + 1 }, (_, i) => ({
        lat: origin.lat + ((destination.lat - origin.lat) * i) / DEMO_POINTS,
        lng: origin.lng + ((destination.lng - origin.lng) * i) / DEMO_POINTS,
      }));
      const distanceM = Math.round(haversineDistanceM(origin, destination));
      const durationS = Math.round(distanceM / DEMO_SPEED_M_PER_S);

      return {
        kind: 'ok',
        route: {
          geometry,
          distanceM,
          durationS,
          instructions: [{ text: `Head straight to your destination ${MESSAGES.demoRouteSuffix}`, distanceM, durationS }],
          avoidedRestrictions: [],
          isDemo: true,
        },
      };
    },
  };
}
