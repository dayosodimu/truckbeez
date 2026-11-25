import { truckProfileSchema } from '@truckbeez/shared';
import { announceErrors, checkDraft, EMPTY_DRAFT, type ProfileDraft } from '../src/profile/draft';

const VAN: ProfileDraft = {
  ...EMPTY_DRAFT,
  height: { ft: '13', in: '6', cm: '' },
  width: { ft: '8', in: '6', cm: '' },
  length: { ft: '72', in: '0', cm: '' },
  weight: { lb: '80000', kg: '' },
  axles: 5,
};

describe('truck details draft (BR-29 §4.4)', () => {
  it('builds the exact profile the API validates, metric and rounded up', () => {
    const { profile, stored, errors } = checkDraft(VAN);
    expect(errors).toEqual({});
    expect(stored).toEqual({ heightCm: 412, widthCm: 260, lengthCm: 2195, grossWeightKg: 36_288 });
    expect(profile).toEqual({ heightM: 4.12, widthM: 2.6, lengthM: 21.95, grossWeightKg: 36_288, axleCount: 5, hazmatClasses: [] });
    expect(truckProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('an empty form has an error for every required field and no profile (no defaults)', () => {
    const { errors, profile } = checkDraft(EMPTY_DRAFT);
    expect(profile).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(['axles', 'height', 'length', 'weight', 'width']);
    expect(errors.height).toBe('Enter your height.');
  });

  it('BR-29 AC-5: 12 or more inches is an error, never carried into feet', () => {
    const { errors, stored } = checkDraft({ ...VAN, height: { ft: '13', in: '12', cm: '' } });
    expect(errors.height).toBe('Inches must be 0 to 11.9');
    expect(stored.heightCm).toBeUndefined();
  });

  it('BR-29 AC-6: 17 ft is out of range; AC-7: 14 ft 9 in only warns', () => {
    expect(checkDraft({ ...VAN, height: { ft: '17', in: '', cm: '' } }).errors.height).toBe('Enter a height between 6 ft and 16 ft.');
    const tall = checkDraft({ ...VAN, height: { ft: '14', in: '9', cm: '' } });
    expect(tall.errors.height).toBeUndefined();
    expect(tall.warnings.height).toMatch(/taller than most US roads/);
    expect(tall.profile).toBeDefined();
  });

  it('warns for oversize width, long length and overweight, without blocking', () => {
    const { warnings, profile } = checkDraft({
      ...VAN,
      width: { ft: '9', in: '0', cm: '' },
      length: { ft: '80', in: '0', cm: '' },
      weight: { lb: '90000', kg: '' },
    });
    expect(Object.keys(warnings).sort()).toEqual(['length', 'weight', 'width']);
    expect(profile).toBeDefined();
  });

  it('metric entry: decimal cm and kg are rounded up', () => {
    const { stored, profile } = checkDraft({
      ...VAN,
      units: 'metric',
      height: { ft: '', in: '', cm: '411.2' },
      width: { ft: '', in: '', cm: '259' },
      length: { ft: '', in: '', cm: '2195' },
      weight: { lb: '', kg: '36288' },
    });
    expect(stored.heightCm).toBe(412);
    expect(profile?.heightM).toBe(4.12);
  });

  it('BR-29 AC-9: hazmat on with no class is an error', () => {
    expect(checkDraft({ ...VAN, hazmat: true }).errors.hazmat).toBe('Pick at least one hazmat class, or turn hazmat off.');
  });

  it('@routing-safety hazmat with tunnel "Not sure" sends the strictest category B', () => {
    expect(checkDraft({ ...VAN, hazmat: true, hazmatClasses: [3] }).profile).toMatchObject({ hazmatClasses: [3], tunnelCategory: 'B' });
    expect(checkDraft({ ...VAN, hazmat: true, hazmatClasses: [3], tunnel: 'D' }).profile?.tunnelCategory).toBe('D');
  });

  it('@routing-safety turning hazmat off sends no classes and no tunnel category', () => {
    const { profile } = checkDraft({ ...VAN, hazmat: false, hazmatClasses: [3], tunnel: 'C' });
    expect(profile?.hazmatClasses).toEqual([]);
    expect(profile).not.toHaveProperty('tunnelCategory');
  });

  it('announces every problem in field order', () => {
    const { errors } = checkDraft({ ...VAN, height: { ft: '17', in: '', cm: '' }, axles: null });
    expect(announceErrors(errors)).toBe('2 problems. Height: enter a height between 6 ft and 16 ft. Axles: enter your axles.');
  });
});
