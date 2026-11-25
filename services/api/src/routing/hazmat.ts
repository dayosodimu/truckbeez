import {
  MESSAGES,
  type HazmatClass,
  type HazmatDivision,
  type SafetyAssumption,
  type TruckProfile,
} from "@truckbeez/shared";

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

/** The hazmat part of a truck profile: everything the mapping reads. */
export type HazmatDeclaration = Pick<TruckProfile, "hazmatClasses" | "hazmatDivisions" | "inhalationHazard">;

/**
 * HERE categories sent for each UN hazard class when its division is NOT known.
 *
 * Where a class spans several HERE categories, every matching one is sent: routing around
 * one restriction too many is safe, routing through one is a P0 bug.
 * Classes 2 and 6 also send `poisonousInhalation` because without a division the load may be
 * 2.3 or a 6.1 inhalation hazard (ADR-0003 decision 3, safety assumptions S1 and S2).
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

/**
 * HERE categories for a declared division (BR-59). Only the divisions that change the
 * inhalation decision are modelled; every other class keeps its class mapping above.
 *
 * - 2.3 toxic gas is an inhalation hazard by definition: always `poisonousInhalation`.
 * - 6.1 toxic substances send `poisonousInhalation` unless the driver explicitly says the
 *   load is NOT an inhalation hazard (`inhalationHazard: false`); see goodsForClass.
 * - 6.2 infectious substances keep the class-6 categories minus `poisonousInhalation` (S2).
 */
export const HERE_GOODS_BY_DIVISION: Record<HazmatDivision, readonly HereHazardousGood[]> = {
  "2.1": ["gas", "flammable"],
  "2.2": ["gas"],
  "2.3": ["gas", "poison", "poisonousInhalation"],
  "6.1": ["poison", "harmfulToWater", "poisonousInhalation"],
  "6.2": ["poison", "harmfulToWater", "other"],
};

/** Classes whose inhalation risk is unknown without a division, so it is assumed (S1, S2). */
export const INHALATION_ASSUMED_CLASSES: readonly HazmatClass[] = [2, 6];

const divisionClass = (division: HazmatDivision): HazmatClass => Number(division.split(".")[0]) as HazmatClass;

interface ClassResolution {
  goods: readonly HereHazardousGood[];
  /** True when `poisonousInhalation` is sent only because the profile lacks the detail to rule it out. */
  inhalationAssumed: boolean;
}

function resolveClass(hazmatClass: HazmatClass, decl: HazmatDeclaration): ClassResolution {
  const divisions = (decl.hazmatDivisions ?? []).filter((d) => divisionClass(d) === hazmatClass);
  if (divisions.length === 0) {
    // Division unknown: class mapping. For 2 and 6 an explicit `inhalationHazard: false` is
    // NOT enough to drop the assumption: without a division we can't check it against 2.3.
    return {
      goods: HERE_GOODS_BY_CLASS[hazmatClass],
      inhalationAssumed: INHALATION_ASSUMED_CLASSES.includes(hazmatClass) && decl.inhalationHazard !== true,
    };
  }

  const goods = new Set(divisions.flatMap((d) => HERE_GOODS_BY_DIVISION[d]));
  let inhalationAssumed = false;
  if (divisions.includes("6.1") && decl.inhalationHazard === false) {
    // The driver declared a 6.1 load that is not an inhalation hazard (no "Inhalation Hazard"
    // on the shipping papers). Drop it only if no other declared division needs it.
    if (!divisions.some((d) => d !== "6.1" && HERE_GOODS_BY_DIVISION[d].includes("poisonousInhalation"))) {
      goods.delete("poisonousInhalation");
    }
  } else if (divisions.includes("6.1") && decl.inhalationHazard === undefined) {
    // 6.1 without the PIH answer: keep the inhalation category and tell the driver.
    inhalationAssumed = true;
  }
  return { goods: [...goods], inhalationAssumed };
}

/** HERE `shippedHazardousGoods` for a truck profile, sorted and de-duplicated. */
export function toHereHazardousGoods(decl: HazmatDeclaration): HereHazardousGood[] {
  const goods = new Set(decl.hazmatClasses.flatMap((c) => resolveClass(c, decl).goods));
  // A declared poison-inhalation hazard (PIH/TIH) is sent whatever the class (49 CFR 171.8).
  if (decl.inhalationHazard === true && decl.hazmatClasses.length > 0) goods.add("poisonousInhalation");
  return [...goods].sort();
}

/** The declared classes routed as inhalation hazards only because the profile lacks detail. */
export function inhalationAssumedClasses(decl: HazmatDeclaration): HazmatClass[] {
  return decl.hazmatClasses.filter((c) => resolveClass(c, decl).inhalationAssumed).sort((a, b) => a - b);
}

/** The assumptions to report to the driver for this profile (ADR-0003 decision 3, S1–S3). */
export function hazmatSafetyAssumptions(decl: HazmatDeclaration): SafetyAssumption[] {
  const assumed = inhalationAssumedClasses(decl);
  if (assumed.length === 0) return [];
  return [{ code: "HAZMAT_INHALATION_ASSUMED", hazmatClasses: assumed, message: MESSAGES.hazmatInhalationAssumed }];
}
