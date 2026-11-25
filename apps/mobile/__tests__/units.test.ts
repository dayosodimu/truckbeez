import { ceilWhole, cmToFeetInches, formatFeetInches, groupThousands, inchesToCmUp, lbToKgUp, parseLatLng, parseOneDecimal, parseWhole } from '../src/units';

describe('units: the truck rounds up, limits round down (BR-29 §4.2)', () => {
  it('BR-29 AC-1/AC-2: 13 ft 6 in → 412 cm, 8 ft 6 in → 260 cm, 80,000 lb → 36,288 kg', () => {
    expect(inchesToCmUp(13 * 12 + 6)).toBe(412);
    expect(inchesToCmUp(8 * 12 + 6)).toBe(260);
    expect(inchesToCmUp(72 * 12)).toBe(2195);
    expect(lbToKgUp(80_000)).toBe(36_288);
  });

  it('@routing-safety never rounds a truck down, and ignores float noise on exact values', () => {
    for (let inches = 72; inches <= 192; inches += 0.5) {
      expect(inchesToCmUp(inches)).toBeGreaterThanOrEqual(inches * 2.54 - 1e-9);
    }
    expect(ceilWhole(3.0000000000000004)).toBe(3); // binary float noise is not a real centimetre
    expect(ceilWhole(411.48)).toBe(412);
  });

  it('limit formatting: a 376 cm limit reads 12 ft 4 in (rounded down, never overstating a clearance; for BR-31 AC-3 once reasonDetails exist)', () => {
    expect(formatFeetInches(cmToFeetInches(376, 'down'))).toBe(`12'4"`);
  });

  it('@routing-safety a stored truck shown in feet rounds UP: 412 cm (13 ft 6.2 in) reads 13 ft 7 in (BR-29 §4.2)', () => {
    // The driver-typed 13'6" is redisplayed as typed (format.test.ts AC-3); this is the no-entered-value case.
    expect(formatFeetInches(cmToFeetInches(412, 'up'))).toBe(`13'7"`);
    expect(formatFeetInches(cmToFeetInches(411.48, 'up'))).toBe(`13'6"`);
  });

  it('parses only what the driver can mean', () => {
    expect(parseWhole('80,000')).toBe(80_000);
    expect(parseWhole('13.5')).toBeUndefined();
    expect(parseOneDecimal('6.5')).toBe(6.5);
    expect(parseOneDecimal('6.55')).toBeUndefined();
    expect(parseLatLng('40.7357, -74.1724')).toEqual({ lat: 40.7357, lng: -74.1724 });
    expect(parseLatLng('91, 0')).toBeUndefined();
    expect(groupThousands(1234567)).toBe('1,234,567');
  });
});
