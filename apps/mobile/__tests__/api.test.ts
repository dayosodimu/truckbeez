import { createPlanRoute } from '../src/api';

const request = {
  origin: { lat: 40.7357, lng: -74.1724 },
  destination: { lat: 39.9526, lng: -75.1652 },
  truck: { heightM: 4.12, widthM: 2.6, lengthM: 21.95, grossWeightKg: 36288, axleCount: 5, hazmatClasses: [] },
};
const route = {
  geometry: [
    { lat: 40.7357, lng: -74.1724 },
    { lat: 39.9526, lng: -75.1652 },
  ],
  distanceM: 186_000,
  durationS: 8040,
  instructions: [],
  avoidedRestrictions: [],
  isDemo: false,
  safetyAssumptions: [],
};
const respond = (status: number, body: unknown) =>
  jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('POST /api/route client (BR-31 §7 states)', () => {
  it('posts the shared RouteRequest as JSON and returns a validated route', async () => {
    const fetchFn = respond(200, route);
    const result = await createPlanRoute('http://api.test', fetchFn as unknown as typeof fetch)(request);
    expect(result).toEqual({ kind: 'route', route });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/route');
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it('@routing-safety 422 becomes noSafeRoute with reasons and safety assumptions, and no geometry', async () => {
    const assumption = { code: 'HAZMAT_INHALATION_ASSUMED', hazmatClasses: [2], message: 'm' };
    const body = { error: { code: 'NO_SAFE_ROUTE', message: 'x', details: { reasons: ['Violated vehicle restriction.'], safetyAssumptions: [assumption] } } };
    const result = await createPlanRoute('', respond(422, body) as unknown as typeof fetch)(request);
    expect(result).toEqual({ kind: 'noSafeRoute', reasons: ['Violated vehicle restriction.'], safetyAssumptions: [assumption] });
    expect(JSON.stringify(result)).not.toContain('geometry');
  });

  it.each([502, 500, 503])('%i is "routing unavailable", never a route', async (status) => {
    expect(await createPlanRoute('', respond(status, { error: { code: 'ROUTING_PROVIDER_ERROR' } }) as unknown as typeof fetch)(request)).toEqual({
      kind: 'unavailable',
      status,
    });
  });

  it('@routing-safety a 200 that is not a real route is "unavailable", not drawn', async () => {
    for (const body of [{}, { geometry: [] }, { ...route, geometry: [route.geometry[0]] }, { ...route, geometry: [{ lat: 'x' }, { lat: 1, lng: 2 }] }, { ...route, distanceM: null }]) {
      expect((await createPlanRoute('', respond(200, body) as unknown as typeof fetch)(request)).kind).toBe('unavailable');
    }
  });

  it('a network error is offline', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await createPlanRoute('', fetchFn as unknown as typeof fetch)(request)).toEqual({ kind: 'offline' });
  });

  it('BR-31 AC-10: no answer within the timeout is offline', async () => {
    const hang = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    );
    expect(await createPlanRoute('', hang as unknown as typeof fetch, 20)(request)).toEqual({ kind: 'offline' });
  });

  it('400 is invalid', async () => {
    expect(await createPlanRoute('', respond(400, { error: { code: 'INVALID_REQUEST' } }) as unknown as typeof fetch)(request)).toEqual({ kind: 'invalid' });
  });
});
