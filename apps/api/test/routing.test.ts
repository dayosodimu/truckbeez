import { describe, expect, it, vi } from 'vitest';
import { decodeFlexiblePolyline } from '../src/routing/flexiblePolyline';
import { toHereHazardousGoods } from '../src/routing/hazmat';
import { buildHereRouteUrl, createHereProvider, parseHereResponse } from '../src/routing/hereProvider';
import { createDemoProvider, haversineDistanceM } from '../src/routing/demoProvider';
import { RoutingProviderError } from '../src/routing/types';
import { EXAMPLE_POLYLINE, hereRouteBody, routeRequest } from './fixtures';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('decodeFlexiblePolyline', () => {
  it("decodes HERE's published example", () => {
    const expected = [
      [50.10228, 8.69821],
      [50.10201, 8.69567],
      [50.10063, 8.6915],
      [50.09878, 8.68752],
    ];
    const points = decodeFlexiblePolyline(EXAMPLE_POLYLINE);
    expect(points).toHaveLength(expected.length);
    points.forEach((point, i) => {
      expect(point.lat).toBeCloseTo(expected[i]![0]!, 5);
      expect(point.lng).toBeCloseTo(expected[i]![1]!, 5);
    });
  });

  it('rejects invalid characters and truncated input', () => {
    expect(() => decodeFlexiblePolyline('BF!!')).toThrow();
    expect(() => decodeFlexiblePolyline('BFo')).toThrow();
  });
});

describe('toHereHazardousGoods', () => {
  it('maps hazard classes to HERE categories without duplicates', () => {
    expect(toHereHazardousGoods([3, 4])).toEqual(['flammable']);
    expect(toHereHazardousGoods([1, 8])).toEqual(['corrosive', 'explosive']);
    expect(toHereHazardousGoods([])).toEqual([]);
  });
});

describe('buildHereRouteUrl', () => {
  it('sends truck mode and the full truck profile, rounding dimensions up', () => {
    const url = buildHereRouteUrl(routeRequest, 'test-key');
    const params = url.searchParams;
    expect(url.origin + url.pathname).toBe('https://router.hereapi.com/v8/routes');
    expect(params.get('transportMode')).toBe('truck');
    expect(params.get('origin')).toBe('40.7357,-74.1724');
    expect(params.get('destination')).toBe('39.9526,-75.1652');
    expect(params.get('vehicle[height]')).toBe('411');
    expect(params.get('vehicle[width]')).toBe('260');
    expect(params.get('vehicle[length]')).toBe('2130');
    expect(params.get('vehicle[grossWeight]')).toBe('36287');
    expect(params.get('vehicle[axleCount]')).toBe('5');
    expect(params.has('vehicle[shippedHazardousGoods]')).toBe(false);
    expect(params.get('apikey')).toBe('test-key');
  });

  it('never rounds a dimension down', () => {
    const url = buildHereRouteUrl({ ...routeRequest, truck: { ...routeRequest.truck, heightM: 4.111 } }, 'k');
    expect(url.searchParams.get('vehicle[height]')).toBe('412');
  });

  it('sends hazmat goods and tunnel category for a hazmat load', () => {
    const truck = { ...routeRequest.truck, hazmatClasses: [3 as const], tunnelCategory: 'D' as const };
    const params = buildHereRouteUrl({ ...routeRequest, truck }, 'k').searchParams;
    expect(params.get('vehicle[shippedHazardousGoods]')).toBe('flammable');
    expect(params.get('vehicle[tunnelCategory]')).toBe('D');
  });
});

describe('parseHereResponse', () => {
  it('returns geometry, totals and instructions for a compliant route', () => {
    const result = parseHereResponse(hereRouteBody);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.route.geometry).toHaveLength(4);
    expect(result.route.distanceM).toBe(186_000);
    expect(result.route.durationS).toBe(8040);
    expect(result.route.instructions.map((i) => i.text)).toEqual([
      'Head east on Market St.',
      'Arrive at your destination.',
    ]);
    expect(result.route.isDemo).toBe(false);
  });

  it('reports no safe route when HERE returns no routes', () => {
    const result = parseHereResponse({ routes: [], notices: [{ title: 'Route calculation failed', code: 'noRouteFound' }] });
    expect(result).toEqual({ kind: 'no_safe_route', reasons: ['Route calculation failed'] });
  });

  it('never passes on a route that violates a restriction', () => {
    const section = hereRouteBody.routes[0]!.sections[0]!;
    const violating = {
      routes: [
        {
          sections: [
            {
              ...section,
              notices: [{ title: 'Violated vehicle restriction.', code: 'violatedVehicleRestriction', severity: 'critical' }],
            },
          ],
        },
      ],
    };
    expect(parseHereResponse(violating)).toEqual({
      kind: 'no_safe_route',
      reasons: ['Violated vehicle restriction.'],
    });
  });

  it('keeps routes that only carry informational notices', () => {
    const section = hereRouteBody.routes[0]!.sections[0]!;
    const body = { routes: [{ sections: [{ ...section, notices: [{ title: 'Toll road', severity: 'info' }] }] }] };
    expect(parseHereResponse(body).kind).toBe('ok');
  });
});

describe('createHereProvider', () => {
  it('calls HERE and parses the route', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(hereRouteBody));
    const provider = createHereProvider({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await provider.route(routeRequest);
    expect(result.kind).toBe('ok');
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it.each([401, 429, 500, 503])('throws a provider error on HTTP %i', async (status) => {
    const fetchFn = vi.fn(async () => jsonResponse({ title: 'error' }, status));
    const provider = createHereProvider({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(provider.route(routeRequest)).rejects.toBeInstanceOf(RoutingProviderError);
  });

  it('throws a provider error when the network fails', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = createHereProvider({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(provider.route(routeRequest)).rejects.toBeInstanceOf(RoutingProviderError);
  });
});

describe('createDemoProvider', () => {
  it('returns a straight line marked as a demo route', async () => {
    const result = await createDemoProvider().route(routeRequest);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.route.isDemo).toBe(true);
    expect(result.route.geometry[0]).toEqual(routeRequest.origin);
    expect(result.route.geometry.at(-1)).toEqual(routeRequest.destination);
    expect(result.route.instructions[0]?.text).toContain('(demo route)');
  });

  it('measures distance with the haversine formula', () => {
    // Newark to Philadelphia is roughly 117 km in a straight line.
    const km = haversineDistanceM(routeRequest.origin, routeRequest.destination) / 1000;
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(125);
  });
});
