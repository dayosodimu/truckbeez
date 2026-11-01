import { randomUUID } from "node:crypto";
import type { LatLng, Report, ReportType } from "../types.js";

/** How long each report type stays on the map without confirmations (minutes). */
const TTL_MIN: Record<ReportType, number> = {
  accident: 60,
  police: 30,
  closure: 240,
  hazard: 45,
  low_clearance: 60 * 24 * 30,
  weigh_open: 90,
  weigh_closed: 90,
  parking_full: 60,
};

// In-memory store for development. Replace with Postgres + PostGIS for production.
const reports = new Map<string, Report>();

export function createReport(type: ReportType, at: LatLng, note?: string): Report {
  const now = Date.now();
  const report: Report = {
    id: randomUUID(),
    type,
    lat: at.lat,
    lng: at.lng,
    note,
    createdAt: now,
    expiresAt: now + TTL_MIN[type] * 60_000,
    confirmations: 0,
  };
  reports.set(report.id, report);
  return report;
}

export function confirmReport(id: string): Report | undefined {
  const r = reports.get(id);
  if (!r) return undefined;
  r.confirmations += 1;
  r.expiresAt = Math.max(r.expiresAt, Date.now() + TTL_MIN[r.type] * 60_000);
  return r;
}

export function listNearby(center: LatLng, radiusKm: number): Report[] {
  const now = Date.now();
  return [...reports.values()].filter(
    (r) => r.expiresAt > now && distanceKm(center, r) <= radiusKm
  );
}

export function pruneExpired(): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, r] of reports) {
    if (r.expiresAt <= now) {
      reports.delete(id);
      removed++;
    }
  }
  return removed;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const toRad = (d: number) => (d * Math.PI) / 180;
