import { MESSAGES, type HazmatClass, type SafetyAssumption } from "../contracts/route.js";

/** Every value HERE Routing v8 accepts for `vehicle[shippedHazardousGoods]`. */
export const HERE_HAZARDOUS_GOODS = [
  "combustible",
  "corrosive",
  "explosive",
  "flammable",
  "gas",
  "harmfulToWater",
  "organic",
  "other",
  "poison",
  "poisonousInhalation",
  "radioactive",
] as const;
export type HereHazardousGood = (typeof HERE_HAZARDOUS_GOODS)[number];

/**
 * HERE categories sent for each UN hazard class.
 *
 * Where a class spans several HERE categories, every matching one is sent: routing around
 * one restriction too many is safe, routing through one is a P0 bug.
 * Classes 2 and 6 also send `poisonousInhalation` because the profile does not yet capture
 * the division (2.3, 6.1 inhalation hazards). Owner decision 3 in ADR-0003.
 */
export const HERE_GOODS_BY_CLASS: Record<HazmatClass, readonly HereHazardousGood[]> = {
  1: ["explosive"],
  2: ["gas", "flammable", "poisonousInhalation"],
  3: ["flammable"],
  4: ["flammable"],
  5: ["organic", "other"],
  6: ["poison", "harmfulToWater", "poisonousInhalation"],
  7: ["radioactive"],
  8: ["corrosive"],
  9: ["other"],
};

export function toHereHazardousGoods(classes: readonly HazmatClass[]): HereHazardousGood[] {
  const goods = new Set(classes.flatMap((hazmatClass) => HERE_GOODS_BY_CLASS[hazmatClass]));
  return [...goods].sort();
}

/**
 * Classes whose division the profile can't express yet, so they are routed as inhalation
 * hazards (2.3, 6.1). Remove a class here only when the profile captures its division and
 * the mapping above sends `poisonousInhalation` for the inhalation divisions alone.
 */
export const INHALATION_ASSUMED_CLASSES: readonly HazmatClass[] = [2, 6];

/** The assumptions to report to the driver for these classes (ADR-0003 decision 3). */
export function hazmatSafetyAssumptions(classes: readonly HazmatClass[]): SafetyAssumption[] {
  const assumed = INHALATION_ASSUMED_CLASSES.filter((c) => classes.includes(c));
  if (assumed.length === 0) return [];
  return [{ code: "HAZMAT_INHALATION_ASSUMED", hazmatClasses: [...assumed], message: MESSAGES.hazmatInhalationAssumed }];
}
