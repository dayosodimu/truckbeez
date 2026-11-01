import { describe, expect, it } from 'vitest';
import {
  HAZMAT_CLASSES,
  formatEta,
  isHazmatLoad,
  routeRequestSchema,
  truckProfileSchema,
  type TruckProfile,
} from './index';

const truck: TruckProfile = {
  heightM: 4.1,
  widthM: 2.6,
  lengthM: 21.5,
  grossWeightKg: 36_000,
  axleCount: 5,
  hazmatClasses: [],
};

describe('truckProfileSchema', () => {
  it('accepts a typical tractor-trailer', () => {
    expect(truckProfileSchema.safeParse(truck).success).toBe(true);
  });

  it('accepts a hazmat load with a tunnel category', () => {
    const result = truckProfileSchema.safeParse({ ...truck, hazmatClasses: [3, 8], tunnelCategory: 'D' });
    expect(result.success).toBe(true);
  });

  it.each([
    ['zero height', { heightM: 0 }],
    ['negative weight', { grossWeightKg: -1 }],
    ['one axle', { axleCount: 1 }],
    ['fractional axles', { axleCount: 4.5 }],
    ['hazmat class 0', { hazmatClasses: [0] }],
    ['hazmat class 10', { hazmatClasses: [10] }],
    ['repeated hazmat class', { hazmatClasses: [3, 3] }],
    ['unknown tunnel category', { tunnelCategory: 'A' }],
  ])('rejects %s', (_name, override) => {
    expect(truckProfileSchema.safeParse({ ...truck, ...override }).success).toBe(false);
  });

  it('rejects a profile missing a dimension', () => {
    const { heightM: _omit, ...withoutHeight } = truck;
    expect(truckProfileSchema.safeParse(withoutHeight).success).toBe(false);
  });

  it('lists all nine hazard classes', () => {
    expect(HAZMAT_CLASSES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('flags hazmat loads', () => {
    expect(isHazmatLoad(truck)).toBe(false);
    expect(isHazmatLoad({ ...truck, hazmatClasses: [1] })).toBe(true);
  });
});

describe('routeRequestSchema', () => {
  const origin = { lat: 40.7128, lng: -74.006 };
  const destination = { lat: 39.9526, lng: -75.1652 };

  it('requires the truck profile', () => {
    expect(routeRequestSchema.safeParse({ origin, destination }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ origin, destination, truck }).success).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    const result = routeRequestSchema.safeParse({ origin: { lat: 91, lng: 0 }, destination, truck });
    expect(result.success).toBe(false);
  });
});

describe('formatEta', () => {
  it('matches the UC-03 example', () => {
    expect(formatEta(2 * 3600 + 14 * 60, 186_000)).toBe('2 h 14 min · 186 km');
  });

  it('drops hours under one hour and keeps a decimal for short trips', () => {
    expect(formatEta(9 * 60, 4_250)).toBe('9 min · 4.3 km');
  });

  it('never shows negative time', () => {
    expect(formatEta(-30, 0)).toBe('0 min · 0.0 km');
  });
});
