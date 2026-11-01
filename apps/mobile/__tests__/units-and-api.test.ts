import { MESSAGES } from '@truckbeez/shared';
import { createPlanRoute } from '../src/api';
import { DEFAULT_TRUCK_VALUES, toTruckProfile } from '../src/components/TruckProfileForm';
import { feetToMetres, parseLatLng, parseNumber, poundsToKg } from '../src/units';

describe('units', () => {
  it('converts feet and pounds', () => {
    expect(feetToMetres(13.5)).toBeCloseTo(4.1148, 4);
    expect(poundsToKg(80_000)).toBeCloseTo(36_287.39, 2);
  });

  it('parses only plain decimal numbers', () => {
    expect(parseNumber(' 13.5 ')).toBe(13.5);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('13 ft')).toBeUndefined();
    expect(parseNumber('-4')).toBeUndefined();
  });

  it('parses "lat, lng"', () => {
    expect(parseLatLng('40.7357, -74.1724')).toEqual({ lat: 40.7357, lng: -74.1724 });
    expect(parseLatLng('40.7357')).toBeUndefined();
  });
});

describe('toTruckProfile', () => {
  it('builds a valid metric profile from the defaults', () => {
    const result = toTruckProfile(DEFAULT_TRUCK_VALUES);
    expect(result.ok).toBe(true);
  });

  it('rejects out-of-range values', () => {
    const result = toTruckProfile({ ...DEFAULT_TRUCK_VALUES, axleCount: '1' });
    expect(result.ok).toBe(false);
  });
});

describe('createPlanRoute', () => {
  const request = {
    origin: { lat: 1, lng: 1 },
    destination: { lat: 2, lng: 2 },
    truck: { heightM: 4, widthM: 2.5, lengthM: 20, grossWeightKg: 30_000, axleCount: 5, hazmatClasses: [] },
  };
  const respond = (status: number, body: unknown) =>
    jest.fn(async () => ({ ok: status < 400, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch & jest.Mock;

  it('posts to /api/route and returns the route', async () => {
    const fetchFn = respond(200, { geometry: [], distanceM: 1, durationS: 1, instructions: [], avoidedRestrictions: [], isDemo: false });
    const result = await createPlanRoute('http://api.test', fetchFn)(request);
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('http://api.test/api/route', expect.objectContaining({ method: 'POST' }));
  });

  it('passes API errors through', async () => {
    const error = { code: 'NO_SAFE_ROUTE', message: MESSAGES.noSafeRoute };
    const result = await createPlanRoute('http://api.test', respond(422, { error }))(request);
    expect(result).toEqual({ ok: false, status: 422, error });
  });

  it('reports a network failure as a routing error', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const result = await createPlanRoute('http://api.test', fetchFn)(request);
    expect(result).toMatchObject({ ok: false, status: 0, error: { code: 'ROUTING_PROVIDER_ERROR' } });
  });
});
