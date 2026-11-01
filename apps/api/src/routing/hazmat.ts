import type { HazmatClass } from '@truckbeez/shared';

/**
 * HERE Routing v8 `vehicle[shippedHazardousGoods]` values for each UN hazard class.
 *
 * Where a class spans several HERE categories, every matching category is sent: routing
 * around one restriction too many is safe, routing through one is a Critical bug (BR-2).
 * Owner review needed before launch: class 2.3 and 6.1 inhalation hazards should also send
 * `poisonousInhalation` once the profile captures the division, not just the class.
 */
export const HERE_HAZARDOUS_GOODS: Record<HazmatClass, readonly string[]> = {
  1: ['explosive'],
  2: ['gas', 'flammable'],
  3: ['flammable'],
  4: ['flammable'],
  5: ['organic', 'other'],
  6: ['poison', 'harmfulToWater'],
  7: ['radioactive'],
  8: ['corrosive'],
  9: ['other'],
};

export function toHereHazardousGoods(classes: readonly HazmatClass[]): string[] {
  const goods = new Set(classes.flatMap((hazmatClass) => HERE_HAZARDOUS_GOODS[hazmatClass]));
  return [...goods].sort();
}
