/**
 * GPX parsing and resampling for GPS simulation (test plan section 7).
 * Pure functions, no WebdriverIO: unit-tested in test/unit/gpx.test.ts.
 */
import { readFileSync } from "node:fs";

export interface GpxPoint {
  lat: number;
  lng: number;
  /** metres, if the track has <ele> */
  ele?: number;
  /** epoch ms, if the track has <time> */
  time?: number;
}

export interface Fix {
  lat: number;
  lng: number;
  altitude: number;
  /** metres per second */
  speedMps: number;
  /** degrees clockwise from north */
  bearing: number;
  /** offset from the start of playback, ms */
  atMs: number;
}

const POINT_RE = /<(trkpt|rtept|wpt)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
const child = (body: string | undefined, name: string) => body?.match(new RegExp(`<${name}>([^<]+)</${name}>`))?.[1];

/**
 * Track points (`trkpt`) in order; falls back to route points (`rtept`), then waypoints.
 * Small regex parser on purpose: GPX fixtures are ours and simple, and it keeps the
 * helper dependency-free.
 */
export function parseGpx(xml: string): GpxPoint[] {
  const byKind: Record<string, GpxPoint[]> = { trkpt: [], rtept: [], wpt: [] };
  for (const m of xml.matchAll(POINT_RE)) {
    const [, kind, attrs, , body] = m;
    const lat = Number(attr(attrs, "lat"));
    const lng = Number(attr(attrs, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error(`Invalid GPX point: lat=${attr(attrs, "lat")} lon=${attr(attrs, "lon")}`);
    }
    const ele = child(body, "ele");
    const time = child(body, "time");
    byKind[kind].push({
      lat,
      lng,
      ...(ele !== undefined ? { ele: Number(ele) } : {}),
      ...(time !== undefined ? { time: Date.parse(time) } : {}),
    });
  }
  const points = byKind.trkpt.length ? byKind.trkpt : byKind.rtept.length ? byKind.rtept : byKind.wpt;
  if (points.length === 0) throw new Error("GPX has no trkpt, rtept or wpt points");
  return points;
}

export function loadGpx(path: string | URL): GpxPoint[] {
  return parseGpx(readFileSync(path, "utf8"));
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: GpxPoint, b: GpxPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: GpxPoint, b: GpxPoint): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export interface ResampleOptions {
  /** Constant driving speed. */
  speedKph: number;
  /** One fix every N ms (phones deliver ~1 Hz). Default 1000. */
  intervalMs?: number;
}

/**
 * Resample a track to evenly spaced fixes at a constant speed, so a test can
 * "drive" it at e.g. 90 km/h (driving lock on) or 4 km/h (walking, lock off).
 * Includes the first and last point.
 */
export function resample(points: GpxPoint[], { speedKph, intervalMs = 1000 }: ResampleOptions): Fix[] {
  if (points.length === 0) return [];
  if (!(speedKph > 0)) throw new Error("speedKph must be > 0");
  const speedMps = speedKph / 3.6;
  const stepM = speedMps * (intervalMs / 1000);

  const fixes: Fix[] = [];
  const push = (p: GpxPoint, bearing: number) =>
    fixes.push({ lat: p.lat, lng: p.lng, altitude: p.ele ?? 0, speedMps, bearing, atMs: fixes.length * intervalMs });

  if (points.length === 1) {
    push(points[0], 0);
    return fixes;
  }

  let carry = 0; // metres already travelled past the last emitted fix
  push(points[0], bearingDeg(points[0], points[1]));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = distanceM(a, b);
    if (seg === 0) continue;
    const bearing = bearingDeg(a, b);
    let d = stepM - carry;
    while (d <= seg) {
      const t = d / seg;
      push(
        {
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
          ele: a.ele !== undefined && b.ele !== undefined ? a.ele + (b.ele - a.ele) * t : a.ele,
        },
        bearing
      );
      d += stepM;
    }
    carry = seg - (d - stepM);
  }
  const last = points[points.length - 1];
  const prev = fixes[fixes.length - 1];
  if (prev.lat !== last.lat || prev.lng !== last.lng) push(last, bearingDeg(points[points.length - 2], last));
  return fixes;
}

/** Total length of a track in metres. */
export function trackLengthM(points: GpxPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}
