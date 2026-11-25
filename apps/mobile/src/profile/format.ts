import type { HazmatClass } from '@truckbeez/shared';
import { cmToFeetInches, formatFeetInches, groupThousands, kgToLb, speakFeetInches } from '../units';
import type { ProfileDraft, Stored, UnitSystem } from './draft';

/** A saved profile: what the driver typed (for redisplay) and what is stored and sent. */
export interface SavedProfile {
  draft: ProfileDraft;
  stored: Required<Stored>;
  axles: number;
  hazmatClasses: HazmatClass[];
}

/**
 * Which class the chip names first (BR-29 §9). The spec ranks divisions; until divisions are
 * captured (BR-59) classes 2 and 6 rank as their most dangerous division (2.3, 6.1 PIH).
 */
const CLASS_PRIORITY: HazmatClass[] = [1, 2, 6, 7, 3, 4, 5, 8, 9];

function heightText(saved: SavedProfile, units: UnitSystem): { text: string; spoken: string } {
  if (units === 'metric') {
    const m = (saved.stored.heightCm / 100).toFixed(2);
    return { text: `${m} m`, spoken: `${m} metres` };
  }
  // Redisplay exactly what was typed when it was typed in feet; otherwise convert, rounding up.
  const { ft, in: inches } = saved.draft.height;
  const fi =
    saved.draft.units === 'imperial'
      ? { ft: Number(ft), in: inches.trim() ? Number(inches) : 0 }
      : cmToFeetInches(saved.stored.heightCm, 'up');
  return { text: formatFeetInches(fi), spoken: speakFeetInches(fi) };
}

function weightText(saved: SavedProfile, units: UnitSystem): { text: string; spoken: string } {
  if (units === 'metric') {
    const t = (saved.stored.grossWeightKg / 1000).toFixed(1);
    return { text: `${t} t`, spoken: `${t} tonnes` };
  }
  const lb =
    saved.draft.units === 'imperial' ? Number(saved.draft.weight.lb.replace(/,/g, '')) : kgToLb(saved.stored.grossWeightKg, 'up');
  return { text: `${groupThousands(lb)} lb`, spoken: `${groupThousands(lb)} pounds` };
}

function hazmatText(classes: HazmatClass[], compact: boolean): { text: string; spoken: string } | undefined {
  if (classes.length === 0) return undefined;
  const ordered = CLASS_PRIORITY.filter((c) => classes.includes(c));
  const more = ordered.length > 1 ? ` +${ordered.length - 1}` : '';
  return {
    text: `Hazmat ${ordered[0]}${compact ? '' : more}`,
    spoken: `hazmat class ${ordered.join(', ')}`,
  };
}

export interface ChipText {
  text: string;
  accessibilityLabel: string;
}

/**
 * The single profile formatter (BR-29 §9), shared by the map chip, the BR-31 "Checked for" line
 * and the editor summary. `compact` drops the weight (navigating, narrow chip).
 */
export function formatProfileChip(saved: SavedProfile | undefined, options: { compact?: boolean; units?: UnitSystem } = {}): ChipText {
  if (!saved) {
    return { text: 'Set truck details', accessibilityLabel: 'Set truck details. No truck details yet. Button.' };
  }
  const units = options.units ?? saved.draft.units;
  const height = heightText(saved, units);
  const weight = weightText(saved, units);
  const hazmat = hazmatText(saved.hazmatClasses, Boolean(options.compact));
  const parts = [height.text, ...(options.compact ? [] : [weight.text]), ...(hazmat ? [hazmat.text] : [])];
  const spoken = [height.spoken, ...(options.compact ? [] : [weight.spoken]), ...(hazmat ? [hazmat.spoken] : [])];
  return {
    text: parts.join(' · '),
    accessibilityLabel: `Truck details: ${spoken.join(', ')}. Button. Double-tap to edit.`,
  };
}

/** Editor summary: "Routing will use: 13'6" · 80,000 lb · 5 axles · No hazmat". */
export function formatProfileSummary(saved: SavedProfile): string {
  const units = saved.draft.units;
  const parts = [
    heightText(saved, units).text,
    weightText(saved, units).text,
    `${saved.axles} axles`,
    hazmatText(saved.hazmatClasses, false)?.text ?? 'No hazmat',
  ];
  return parts.join(' · ');
}
