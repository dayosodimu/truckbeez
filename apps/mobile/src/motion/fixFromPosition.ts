import type { SpeedFix } from './motion';

/**
 * Turn an OS position into a speed reading the driving lock can trust (security review of
 * PR #35, H1/M1). Pure, so the rules are unit-tested.
 *
 * - Android (expo-location 19) reports an UNKNOWN speed as 0, so a reported 0 alone is not
 *   proof of parking. Speed is also derived from consecutive positions, and the higher of the
 *   two is used, so a truck that moves while the OS says 0 still reads as moving.
 * - A fix that is too inaccurate to tell a parked truck from a slow one, has no accuracy, or is
 *   flagged as mocked (a mock-location app) counts as no speed: moving.
 *
 * Positions are used here only for that comparison and are kept in memory as the single
 * previous fix; they are never sent, logged or stored (non-negotiable #4).
 */
export const MAX_ACCURACY_M = 20;
/*
 * Why 20 m: network / approximate fixes (the ones Android reports without a speed) are usually
 * worse than 20 m, so they never count as evidence of parking. A GPS-grade fix carries Doppler
 * speed. The position cross-check catches real driving speeds (a truck at 50 km/h moves 14 m
 * a second); a crawl slower than the fix accuracy can't be told from parked by any phone sensor,
 * which is why "moving" starts at 8 km/h (BR-29 §7).
 */

export interface PositionLike {
  timestamp: number;
  mocked?: boolean;
  coords: { latitude: number; longitude: number; speed: number | null; accuracy: number | null };
}

export interface PrevFix {
  lat: number;
  lng: number;
  at: number;
}

const EARTH_M = 6_371_000;
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

export function fixFromPosition(position: PositionLike, prev: PrevFix | undefined): { fix: SpeedFix; prev: PrevFix } {
  const { latitude: lat, longitude: lng, speed, accuracy } = position.coords;
  const at = position.timestamp;
  const next: PrevFix = { lat, lng, at };
  const untrusted = position.mocked === true || accuracy === null || !Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_M;
  if (untrusted) return { fix: { speedMps: null, at }, prev: next };

  const reported = speed !== null && Number.isFinite(speed) && speed >= 0 ? speed : undefined;
  let derived: number | undefined;
  if (prev && at > prev.at) {
    const metres = distanceM(prev, next);
    // Only movement larger than the fix accuracy counts, so GPS jitter while parked isn't speed.
    derived = metres > accuracy! ? metres / ((at - prev.at) / 1000) : 0;
  }
  if (reported === undefined && derived === undefined) return { fix: { speedMps: null, at }, prev: next };
  // A reported 0 with no previous fix to check it against is not proof of parking.
  if (reported === 0 && derived === undefined) return { fix: { speedMps: null, at }, prev: next };
  return { fix: { speedMps: Math.max(reported ?? 0, derived ?? 0), at }, prev: next };
}
