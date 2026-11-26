import { MOTION, type SpeedFix } from './motion';

/**
 * Turn an OS position into a speed reading the driving lock can trust (security review of
 * PR #35, H1/M1 and re-review H1-R). Pure, so the rules are unit-tested.
 *
 * - Android (expo-location 19) reports an UNKNOWN speed as 0, so a reported 0 alone is not
 *   proof of parking. Speed is also derived from positions, and the higher of the two is used.
 * - A fix that is too inaccurate, has no accuracy, or is flagged as mocked (a mock-location
 *   app) counts as no speed: moving.
 * - H1-R: movement smaller than the fix accuracy can't be seen between two 1 s fixes (a truck
 *   at 50 km/h moves 14 m a second, inside a 15 m accuracy). So distance is measured from an
 *   ANCHOR: the fix where the truck was last seen to move. A low speed only counts once the
 *   anchor is old enough that a truck doing more than MOTION.movingKmh would have left both
 *   fixes' error ((current + anchor accuracy) / age <= 8 km/h). Until then the reading is "no
 *   speed" (moving). Cost: parking is confirmed after about (2 x accuracy) / 2.2 m/s plus the
 *   5 s hold (10 s at 5 m, 23 s at 20 m). Safety over speed (non-negotiable #1).
 *
 * Positions are used here only for that comparison and are kept in memory as the single
 * anchor fix; they are never sent, logged or stored (non-negotiable #4).
 */
export const MAX_ACCURACY_M = 20;
/*
 * Why 20 m: network / approximate fixes (the ones Android reports without a speed) are usually
 * worse than 20 m, so they never count as evidence of parking. It also caps how long the
 * anchor rule above can delay parking ((20 + 20) m / 2.2 m/s = 18 s).
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
  /** The anchor fix's own accuracy (m); its error adds to the current fix's (re-review F1). */
  acc?: number;
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
  const here: PrevFix = { lat, lng, at, acc: accuracy ?? undefined };
  const untrusted = position.mocked === true || accuracy === null || !Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_M;
  if (untrusted) return { fix: { speedMps: null, at }, prev: here };
  // No anchor yet, or time went backwards: start a new anchor; nothing proves parking yet.
  if (!prev || at <= prev.at) return { fix: { speedMps: null, at }, prev: here };

  const reported = speed !== null && Number.isFinite(speed) && speed >= 0 ? speed : 0;
  const ageS = (at - prev.at) / 1000;
  const metres = distanceM(prev, here);
  if (metres > accuracy!) {
    // Seen to move: that is the speed, and this fix becomes the new anchor.
    return { fix: { speedMps: Math.max(reported, metres / ageS), at }, prev: here };
  }
  const movingMps = MOTION.movingKmh / 3.6;
  // Still inside the accuracy circle, but too soon to rule out driving faster than 8 km/h.
  // Both fixes can be off by their accuracy, so allow for the anchor's error too (F1).
  const uncertaintyM = accuracy! + (prev.acc ?? accuracy!);
  if (reported <= movingMps && uncertaintyM / ageS > movingMps) return { fix: { speedMps: null, at }, prev };
  return { fix: { speedMps: reported, at }, prev };
}
