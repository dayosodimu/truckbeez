/**
 * Units and rounding (BR-29 §4.2). The truck's own numbers are rounded UP when stored;
 * limits shown to the driver (BR-31 reasons) are rounded DOWN. Both are the safe side.
 * The wire format is metric (metres, kilograms) from @truckbeez/shared.
 */
export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;

/** ceil() that ignores binary float noise, so 411.0000000001 isn't stored as 412 (BR-47). */
export const ceilWhole = (value: number): number => Math.ceil(Number(value.toFixed(6)));
export const floorWhole = (value: number): number => Math.floor(Number(value.toFixed(6)));

export const inchesToCmUp = (inches: number): number => ceilWhole(inches * CM_PER_INCH);
export const lbToKgUp = (lb: number): number => ceilWhole(lb * KG_PER_LB);

export interface FeetInches {
  ft: number;
  in: number;
}

/** Centimetres to whole feet and inches, rounded `up` (the truck) or `down` (a limit). */
export function cmToFeetInches(cm: number, direction: 'up' | 'down'): FeetInches {
  const exact = cm / CM_PER_INCH;
  const inches = direction === 'up' ? ceilWhole(exact) : floorWhole(exact);
  return { ft: Math.floor(inches / 12), in: inches % 12 };
}

export const kgToLb = (kg: number, direction: 'up' | 'down'): number =>
  direction === 'up' ? ceilWhole(kg / KG_PER_LB) : floorWhole(kg / KG_PER_LB);

/** 13'6" (inches may carry one decimal, e.g. 13'6.5"). */
export const formatFeetInches = ({ ft, in: inches }: FeetInches): string => `${ft}'${trimDecimal(inches)}"`;

/** "13 feet 6 inches", for screen readers. */
export const speakFeetInches = ({ ft, in: inches }: FeetInches): string =>
  `${ft} ${ft === 1 ? 'foot' : 'feet'}${inches ? ` ${trimDecimal(inches)} ${inches === 1 ? 'inch' : 'inches'}` : ''}`;

/** 80,000. Deterministic grouping (no Intl dependency on Hermes). */
export const groupThousands = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const trimDecimal = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Whole number typed by the driver ("80,000" allowed); undefined for anything else. */
export function parseWhole(input: string): number | undefined {
  const cleaned = input.replace(/,/g, '').trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : undefined;
}

/** Number with at most one decimal ("6", "6.5"); undefined for anything else. */
export function parseOneDecimal(input: string): number | undefined {
  const cleaned = input.trim();
  return /^\d+(\.\d)?$/.test(cleaned) ? Number(cleaned) : undefined;
}

/** "lat, lng" text to coordinates; undefined if malformed or out of range. */
export function parseLatLng(input: string): { lat: number; lng: number } | undefined {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export const formatDistance = (metres: number, units: 'imperial' | 'metric'): string =>
  units === 'imperial' ? `${groupThousands(metres / 1609.344)} mi` : `${groupThousands(metres / 1000)} km`;
