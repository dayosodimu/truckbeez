import { truckProfileSchema, type HazmatClass, type TruckProfile, type TunnelCategory } from '@truckbeez/shared';
import { inchesToCmUp, lbToKgUp, parseOneDecimal, parseWhole } from '../units';

/**
 * The truck details editor's draft (BR-29 §4). The driver's entered values and unit are kept,
 * so the editor always redisplays what was typed (no drift, AC-3). Stored values are metric
 * integers rounded UP (§4.2); the wire profile is built from them with the shared schema.
 *
 * E1 scope: hazmat classes and tunnel category. Divisions and the PIH switch (§5.1) follow
 * PR #28 (BR-59); until then classes 2 and 6 are routed by the server as inhalation hazards
 * and the route response says so.
 */
export type UnitSystem = 'imperial' | 'metric';
export type TunnelChoice = TunnelCategory | 'notSure';
export type DimensionField = 'height' | 'width' | 'length';
export type Field = DimensionField | 'weight' | 'axles' | 'hazmat';

export interface ProfileDraft {
  units: UnitSystem;
  height: { ft: string; in: string; cm: string };
  width: { ft: string; in: string; cm: string };
  length: { ft: string; in: string; cm: string };
  weight: { lb: string; kg: string };
  /** null until the driver sets it: no defaults, a default would be a guess (§9). */
  axles: number | null;
  hazmat: boolean;
  hazmatClasses: HazmatClass[];
  tunnel: TunnelChoice;
}

export const EMPTY_DRAFT: ProfileDraft = {
  units: 'imperial',
  height: { ft: '', in: '', cm: '' },
  width: { ft: '', in: '', cm: '' },
  length: { ft: '', in: '', cm: '' },
  weight: { lb: '', kg: '' },
  axles: null,
  hazmat: false,
  hazmatClasses: [],
  tunnel: 'notSure',
};

/** Hard limits that block Save (BR-29 §4.4), in stored units. Tighter than the API's, so always valid there. */
export const LIMITS = {
  height: { minCm: 183, maxCm: 488, imperial: '6 ft and 16 ft' },
  width: { minCm: 183, maxCm: 305, imperial: '6 ft and 10 ft' },
  length: { minCm: 305, maxCm: 3658, imperial: '10 ft and 120 ft' },
  weight: { minKg: 2268, maxKg: 90719, imperial: '5,000 lb and 200,000 lb', metric: '2,268 kg and 90,719 kg' },
  axles: { min: 2, max: 12 },
} as const;

/** Soft warnings (don't block). Thresholds are compared on the stored value. */
const WARNINGS = {
  heightHigh: { cm: inchesToCmUp(14 * 12 + 6), text: "That's taller than most US roads allow. Double-check your height." },
  heightLow: { cm: inchesToCmUp(10 * 12), text: "That's low for a tractor-trailer. Double-check." },
  widthHigh: { cm: inchesToCmUp(8 * 12 + 6), text: 'Over 8 ft 6 in is oversize. You may need a permit.' },
  lengthHigh: { cm: inchesToCmUp(75 * 12), text: "That's long. Check that this includes tractor and trailer." },
  weightHigh: { kg: lbToKgUp(80_000), text: 'Over 80,000 lb usually needs an overweight permit.' },
} as const;

const LABEL: Record<Field, string> = {
  height: 'height',
  width: 'width',
  length: 'length',
  weight: 'gross weight',
  axles: 'axles',
  hazmat: 'hazmat',
};

export interface Stored {
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  grossWeightKg?: number;
}

export interface DraftCheck {
  errors: Partial<Record<Field, string>>;
  warnings: Partial<Record<Field, string>>;
  stored: Stored;
  /** Present only when there are no errors: the exact body the API will validate. */
  profile?: TruckProfile;
}

/** Order the fields appear in, for "scroll to the first error" and the announcement. */
export const FIELD_ORDER: Field[] = ['height', 'width', 'length', 'weight', 'axles', 'hazmat'];

function dimensionCm(draft: ProfileDraft, field: DimensionField): { cm?: number; error?: string } {
  const value = draft[field];
  if (draft.units === 'metric') {
    if (!value.cm.trim()) return { error: `Enter your ${LABEL[field]}.` };
    const cm = parseOneDecimal(value.cm);
    if (cm === undefined) return { error: `Enter your ${LABEL[field]} in centimetres.` };
    return { cm: Math.ceil(cm) };
  }
  if (!value.ft.trim()) return { error: `Enter your ${LABEL[field]}.` };
  const ft = parseWhole(value.ft);
  if (ft === undefined) return { error: `Enter whole feet for your ${LABEL[field]}.` };
  const inches = value.in.trim() ? parseOneDecimal(value.in) : 0;
  // §4.2: never carry 12+ inches into feet silently.
  if (inches === undefined || inches >= 12) return { error: 'Inches must be 0 to 11.9' };
  return { cm: inchesToCmUp(ft * 12 + inches) };
}

function rangeError(field: DimensionField, cm: number, units: UnitSystem): string | undefined {
  const { minCm, maxCm, imperial } = LIMITS[field];
  if (cm >= minCm && cm <= maxCm) return undefined;
  return units === 'imperial'
    ? `Enter a ${LABEL[field]} between ${imperial}.`
    : `Enter a ${LABEL[field]} between ${minCm} cm and ${maxCm} cm.`;
}

export function checkDraft(draft: ProfileDraft): DraftCheck {
  const errors: DraftCheck['errors'] = {};
  const warnings: DraftCheck['warnings'] = {};
  const stored: Stored = {};

  for (const field of ['height', 'width', 'length'] as const) {
    const { cm, error } = dimensionCm(draft, field);
    if (error) {
      errors[field] = error;
      continue;
    }
    stored[`${field}Cm`] = cm;
    const outOfRange = rangeError(field, cm!, draft.units);
    if (outOfRange) errors[field] = outOfRange;
  }

  const weightText = draft.units === 'imperial' ? draft.weight.lb : draft.weight.kg;
  const weightValue = parseWhole(weightText);
  if (!weightText.trim()) errors.weight = 'Enter your gross weight.';
  else if (weightValue === undefined) errors.weight = 'Enter the weight as a whole number.';
  else {
    const kg = draft.units === 'imperial' ? lbToKgUp(weightValue) : weightValue;
    stored.grossWeightKg = kg;
    if (kg < LIMITS.weight.minKg || kg > LIMITS.weight.maxKg) {
      errors.weight = `Enter a gross weight between ${draft.units === 'imperial' ? LIMITS.weight.imperial : LIMITS.weight.metric}.`;
    }
  }

  if (draft.axles === null) errors.axles = 'Enter your axles.';
  else if (draft.axles < LIMITS.axles.min || draft.axles > LIMITS.axles.max || !Number.isInteger(draft.axles)) {
    errors.axles = `Enter between ${LIMITS.axles.min} and ${LIMITS.axles.max} axles.`;
  }

  if (draft.hazmat && draft.hazmatClasses.length === 0) {
    errors.hazmat = 'Pick at least one hazmat class, or turn hazmat off.';
  }

  if (!errors.height && stored.heightCm !== undefined) {
    if (stored.heightCm > WARNINGS.heightHigh.cm) warnings.height = WARNINGS.heightHigh.text;
    else if (stored.heightCm < WARNINGS.heightLow.cm) warnings.height = WARNINGS.heightLow.text;
  }
  if (!errors.width && stored.widthCm !== undefined && stored.widthCm > WARNINGS.widthHigh.cm) {
    warnings.width = WARNINGS.widthHigh.text;
  }
  if (!errors.length && stored.lengthCm !== undefined && stored.lengthCm > WARNINGS.lengthHigh.cm) {
    warnings.length = WARNINGS.lengthHigh.text;
  }
  if (!errors.weight && stored.grossWeightKg !== undefined && stored.grossWeightKg > WARNINGS.weightHigh.kg) {
    warnings.weight = WARNINGS.weightHigh.text;
  }

  if (Object.keys(errors).length > 0) return { errors, warnings, stored };

  const parsed = truckProfileSchema.safeParse({
    heightM: stored.heightCm! / 100,
    widthM: stored.widthCm! / 100,
    lengthM: stored.lengthCm! / 100,
    grossWeightKg: stored.grossWeightKg!,
    axleCount: draft.axles!,
    hazmatClasses: draft.hazmat ? draft.hazmatClasses : [],
    // "Not sure" sends the strictest category (BR-29 §6; BR-73 owner decision pending): a hazmat
    // load must never be routed with less tunnel protection than it may need.
    ...(draft.hazmat ? { tunnelCategory: draft.tunnel === 'notSure' ? 'B' : draft.tunnel } : {}),
  });
  if (!parsed.success) {
    // Can't happen while LIMITS stay inside the shared schema; never send an unchecked profile.
    return { errors: { height: 'Check your truck details: one or more values are out of range.' }, warnings, stored };
  }
  return { errors, warnings, stored, profile: parsed.data };
}

/** "2 problems. Height: enter a height between 6 ft and 16 ft. …" (BR-29 §4.4). */
export function announceErrors(errors: DraftCheck['errors']): string {
  const fields = FIELD_ORDER.filter((f) => errors[f]);
  const count = fields.length === 1 ? '1 problem' : `${fields.length} problems`;
  const parts = fields.map((f) => `${capitalise(LABEL[f])}: ${lowerFirst(errors[f]!.replace(/\.$/, ''))}`);
  return `${[count, ...parts].join('. ')}.`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
