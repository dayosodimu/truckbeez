/**
 * Hazardous-goods categories the driver can declare on their truck profile.
 *
 * These are HERE Routing v8 `vehicle[shippedHazardousGoods]` values and must match
 * `HERE_HAZARDOUS_GOODS` in apps/server/src/lib/hereRouting.ts exactly: a category the
 * driver can't pick here is a load the router never hears about (CLAUDE.md non-negotiable #2).
 * apps/server/test/hazmat-options.test.ts fails CI if the two lists drift apart.
 *
 * This file must stay plain TypeScript (no React Native imports) so the server test can load it.
 *
 * NOT here: mapping a UN hazard class/division (e.g. 2.3, 6.1 PIH/TIH) to these categories.
 * That needs owner review first and is a separate change. See "Hazmat mapping review" under
 * "Must fix before launch" in docs/adr/0001-truck-routing-engine.md.
 */

export type HazmatCategory =
  | "explosive"
  | "gas"
  | "flammable"
  | "combustible"
  | "organic"
  | "poison"
  | "poisonousInhalation"
  | "radioactive"
  | "corrosive"
  | "harmfulToWater"
  | "other";

export type HazmatOption = { value: HazmatCategory; label: string };

/** Display order and driver-facing labels. */
export const HAZMAT_OPTIONS: readonly HazmatOption[] = [
  { value: "explosive", label: "Explosives" },
  { value: "gas", label: "Gases" },
  { value: "flammable", label: "Flammable" },
  { value: "combustible", label: "Combustible" },
  { value: "organic", label: "Organic material" },
  { value: "poison", label: "Poison (toxic)" },
  { value: "poisonousInhalation", label: "Inhalation hazard (PIH / TIH)" },
  { value: "radioactive", label: "Radioactive" },
  { value: "corrosive", label: "Corrosive" },
  { value: "harmfulToWater", label: "Harmful to water" },
  { value: "other", label: "Other hazardous goods" },
];
