/** US drivers enter feet and pounds; the API works in metres and kilograms. */

export const FEET_TO_M = 0.3048;
export const LB_TO_KG = 0.45359237;

export const feetToMetres = (feet: number): number => feet * FEET_TO_M;
export const poundsToKg = (pounds: number): number => pounds * LB_TO_KG;

/** Parses a decimal number typed by the user; returns undefined for anything else. */
export function parseNumber(input: string): number | undefined {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** Parses "lat, lng" text into coordinates; returns undefined if malformed. */
export function parseLatLng(input: string): { lat: number; lng: number } | undefined {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}
