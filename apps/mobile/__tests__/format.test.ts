import { checkDraft, EMPTY_DRAFT, type ProfileDraft } from '../src/profile/draft';
import { formatProfileChip, formatProfileSummary, type SavedProfile } from '../src/profile/format';

function saved(draft: ProfileDraft): SavedProfile {
  const c = checkDraft(draft);
  if (!c.profile) throw new Error(JSON.stringify(c.errors));
  return { draft, stored: c.stored as SavedProfile['stored'], axles: draft.axles!, hazmatClasses: c.profile.hazmatClasses };
}

const VAN: ProfileDraft = {
  ...EMPTY_DRAFT,
  height: { ft: '13', in: '6', cm: '' },
  width: { ft: '8', in: '6', cm: '' },
  length: { ft: '72', in: '', cm: '' },
  weight: { lb: '80000', kg: '' },
  axles: 5,
};

describe('formatProfileChip (BR-29 §9, AC-22/AC-23)', () => {
  it.each([
    ['no hazmat', VAN, `13'6" · 80,000 lb`],
    ['one class', { ...VAN, hazmat: true, hazmatClasses: [3] }, `13'6" · 80,000 lb · Hazmat 3`],
    ['several classes, most dangerous first', { ...VAN, hazmat: true, hazmatClasses: [3, 8, 2] }, `13'6" · 80,000 lb · Hazmat 2 +2`],
  ] as [string, ProfileDraft, string][])('%s', (_name, draft, text) => {
    expect(formatProfileChip(saved(draft)).text).toBe(text);
  });

  it('metric: 4.12 m · 36.3 t · Hazmat 3', () => {
    expect(formatProfileChip(saved({ ...VAN, hazmat: true, hazmatClasses: [3] }), { units: 'metric' }).text).toBe('4.12 m · 36.3 t · Hazmat 3');
  });

  it('compact drops the weight and the +n', () => {
    expect(formatProfileChip(saved({ ...VAN, hazmat: true, hazmatClasses: [3, 8] }), { compact: true }).text).toBe(`13'6" · Hazmat 3`);
  });

  it('AC-23: an empty profile reads "Set truck details"', () => {
    expect(formatProfileChip(undefined).text).toBe('Set truck details');
  });

  it('speaks units in words for screen readers', () => {
    expect(formatProfileChip(saved({ ...VAN, hazmat: true, hazmatClasses: [3] })).accessibilityLabel).toBe(
      'Truck details: 13 feet 6 inches, 80,000 pounds, hazmat class 3. Button. Double-tap to edit.'
    );
  });

  it('AC-3: redisplays exactly what was typed (no drift to 13\'7")', () => {
    expect(formatProfileSummary(saved(VAN))).toBe(`13'6" · 80,000 lb · 5 axles · No hazmat`);
  });
});
