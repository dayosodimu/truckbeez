import { z } from 'zod';

/**
 * A truck profile is sent with every route request (BR-3, BR-4).
 * Units are metric (metres, kilograms) on the wire; the app converts for display.
 */

/** UN hazard classes 1–9. */
export const HAZMAT_CLASS_LABELS = {
  1: 'Explosives',
  2: 'Gases',
  3: 'Flammable liquids',
  4: 'Flammable solids',
  5: 'Oxidizers & organic peroxides',
  6: 'Toxic & infectious substances',
  7: 'Radioactive material',
  8: 'Corrosives',
  9: 'Miscellaneous dangerous goods',
} as const;

export type HazmatClass = keyof typeof HAZMAT_CLASS_LABELS;

export const HAZMAT_CLASSES = Object.keys(HAZMAT_CLASS_LABELS).map(Number) as HazmatClass[];

export const hazmatClassSchema = z
  .number()
  .int()
  .min(1)
  .max(9)
  .transform((n) => n as HazmatClass);

/** ADR tunnel restriction code. B is the most restrictive, E the least. */
export const tunnelCategorySchema = z.enum(['B', 'C', 'D', 'E']);
export type TunnelCategory = z.infer<typeof tunnelCategorySchema>;

export const truckProfileSchema = z.object({
  heightM: z.number().positive().max(6),
  widthM: z.number().positive().max(5),
  lengthM: z.number().positive().max(50),
  grossWeightKg: z.number().positive().max(200_000),
  axleCount: z.number().int().min(2).max(20),
  hazmatClasses: z
    .array(hazmatClassSchema)
    .max(9)
    .refine((classes) => new Set(classes).size === classes.length, {
      message: 'Hazmat classes must not repeat',
    }),
  tunnelCategory: tunnelCategorySchema.optional(),
});

export type TruckProfile = z.infer<typeof truckProfileSchema>;

export const isHazmatLoad = (profile: TruckProfile): boolean => profile.hazmatClasses.length > 0;
