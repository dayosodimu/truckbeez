import { decode } from "@here/flexpolyline";
import type { LatLng, RouteResult, TruckProfile } from "../types.js";
import { distanceKm } from "./store.js";

/**
 * Truck-safe routing. Uses HERE Routing API v8 when HERE_API_KEY is set,
 * otherwise a straight-line demo route so the app works in development.
 * Check parameter names against the current HERE docs before production.
 */
export async function getTruckRoute(
  origin: LatLng,
  destination: LatLng,
  profile: TruckProfile
): Promise<RouteResult> {
  const apiKey = process.env.HERE_API_KEY;
  if (!apiKey) return demoRoute(origin, destination);

  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    return: "polyline,summary,instructions,actions",
    "vehicle[height]": String(profile.heightCm),
    "vehicle[width]": String(profile.widthCm),
    "vehicle[length]": String(profile.lengthCm),
    "vehicle[grossWeight]": String(profile.grossWeightKg),
    "vehicle[axleCount]": String(profile.axleCount),
    apiKey,
  });
  if (profile.hazmat.length) {
    params.set("vehicle[shippedHazardousGoods]", profile.hazmat.join(","));
  }

  const res = await fetch(`https://router.hereapi.com/v8/routes?${params}`);
  if (!res.ok) {
    throw new Error(`Routing provider error ${res.status}: ${await res.text()}`);
  }
  const data: any = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No truck-safe route found for this vehicle.");

  const coordinates: LatLng[] = [];
  const instructions: string[] = [];
  let distanceM = 0;
  let durationS = 0;

  for (const section of route.sections) {
    for (const [lat, lng] of decode(section.polyline).polyline) {
      coordinates.push({ lat, lng });
    }
    distanceM += section.summary?.length ?? 0;
    durationS += section.summary?.duration ?? 0;
    for (const action of section.actions ?? []) {
      if (action.instruction) instructions.push(action.instruction);
    }
  }

  return { provider: "here", distanceM, durationS, coordinates, instructions };
}

function demoRoute(origin: LatLng, destination: LatLng): RouteResult {
  const km = distanceKm(origin, destination);
  return {
    provider: "demo",
    distanceM: Math.round(km * 1000),
    durationS: Math.round((km / 70) * 3600), // assume 70 km/h average
    coordinates: [origin, destination],
    instructions: ["Demo route: add HERE_API_KEY to the server for real truck routing."],
  };
}
