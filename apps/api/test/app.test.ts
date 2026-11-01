import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '@truckbeez/shared';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDemoProvider } from '../src/routing/demoProvider';
import { RoutingProviderError, type RouteResult, type RoutingProvider } from '../src/routing/types';
import { routeRequest } from './fixtures';

const silentLogger = { warn: vi.fn(), error: vi.fn() };

const providerReturning = (impl: () => Promise<RouteResult>): RoutingProvider => ({ name: 'stub', route: vi.fn(impl) });

describe('GET /health', () => {
  it('reports status and routing provider', async () => {
    const app = createApp({ routingProvider: createDemoProvider(), logger: silentLogger });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', routingProvider: 'demo' });
  });
});

describe('POST /api/route', () => {
  it('returns a demo route when no HERE key is configured', async () => {
    const app = createApp({ routingProvider: createDemoProvider(), logger: silentLogger });
    const res = await request(app).post('/api/route').send(routeRequest);
    expect(res.status).toBe(200);
    expect(res.body.isDemo).toBe(true);
    expect(res.body.geometry.length).toBeGreaterThan(1);
  });

  it('passes the full truck profile to the routing provider', async () => {
    const provider = createDemoProvider();
    const spy = vi.spyOn(provider, 'route');
    const app = createApp({ routingProvider: provider, logger: silentLogger });
    await request(app).post('/api/route').send(routeRequest);
    expect(spy).toHaveBeenCalledWith(routeRequest);
  });

  it('rejects a request without a truck profile with 400', async () => {
    const provider = providerReturning(async () => ({ kind: 'no_safe_route', reasons: [] }));
    const app = createApp({ routingProvider: provider, logger: silentLogger });
    const { truck: _omit, ...withoutTruck } = routeRequest;
    const res = await request(app).post('/api/route').send(withoutTruck);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_REQUEST', message: MESSAGES.invalidRequest });
    expect(provider.route).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400', async () => {
    const app = createApp({ routingProvider: createDemoProvider(), logger: silentLogger });
    const res = await request(app).post('/api/route').set('Content-Type', 'application/json').send('{"origin":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 422 and no route when no truck-safe route exists', async () => {
    const provider = providerReturning(async () => ({ kind: 'no_safe_route', reasons: ['Low bridge 3.9 m'] }));
    const app = createApp({ routingProvider: provider, logger: silentLogger });
    const res = await request(app).post('/api/route').send(routeRequest);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'NO_SAFE_ROUTE', message: MESSAGES.noSafeRoute, details: { reasons: ['Low bridge 3.9 m'] } },
    });
    expect(res.body.geometry).toBeUndefined();
  });

  it('returns 502 when the routing provider fails', async () => {
    const provider = providerReturning(async () => {
      throw new RoutingProviderError('HERE responded with HTTP 503', 503);
    });
    const app = createApp({ routingProvider: provider, logger: silentLogger });
    const res = await request(app).post('/api/route').send(routeRequest);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('ROUTING_PROVIDER_ERROR');
  });

  it('returns 500 without leaking details on an unexpected error', async () => {
    const provider = providerReturning(async () => {
      throw new Error('secret internals');
    });
    const app = createApp({ routingProvider: provider, logger: silentLogger });
    const res = await request(app).post('/api/route').send(routeRequest);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret internals');
  });
});

describe('unknown routes', () => {
  it('return 404 JSON', async () => {
    const app = createApp({ routingProvider: createDemoProvider(), logger: silentLogger });
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('loadConfig', () => {
  it('refuses to start production without a HERE key', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/HERE_API_KEY/);
  });

  it('allows development without a key and parses CORS origins', () => {
    const config = loadConfig({ PORT: '5000', CORS_ORIGINS: 'http://localhost:8081, https://app.truckbeez.com' });
    expect(config).toEqual({
      port: 5000,
      isProduction: false,
      hereApiKey: undefined,
      corsOrigins: ['http://localhost:8081', 'https://app.truckbeez.com'],
    });
  });
});
