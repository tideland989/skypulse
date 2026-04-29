import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { config } from '../config.js';
import { makeTestApp, VALID_WEATHER, VALID_AIR_QUALITY, jsonResponse } from './helpers.js';
import { _resetCachesForTest } from '../services/weather.js';

const WEATHER_HOST = 'https://api.open-meteo.com';
const AIR_QUALITY_HOST = 'https://air-quality-api.open-meteo.com';
const ANALYTICS_URL = 'https://analytics.test/post';

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

function installFetchMock(handler: (url: string, init?: RequestInit) => Promise<Response>): {
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return { calls };
}

beforeEach(() => {
  _resetCachesForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/v1/activity-score', () => {
  it('happy path: returns score, recommendation, weather, air_quality; analytics fired with bearer + user_id', async () => {
    const analyticsResolved = Promise.withResolvers<void>();
    const { calls } = installFetchMock(async (url) => {
      if (url.startsWith(WEATHER_HOST)) return jsonResponse(VALID_WEATHER);
      if (url.startsWith(AIR_QUALITY_HOST)) return jsonResponse(VALID_AIR_QUALITY);
      if (url === ANALYTICS_URL) {
        analyticsResolved.resolve();
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const { app } = makeTestApp();
    const res = await request(app).get('/api/v1/activity-score?lat=40.71&lon=-74.01&user_id=u1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      score: 100,
      recommendation: 'Good conditions for outdoor activities',
      weather: { temperature: 20, wind_speed: 5, conditions: 1 },
      air_quality: { pm2_5: 8, pm10: 20 },
    });

    // Analytics fires async; wait for it before asserting.
    await analyticsResolved.promise;

    const analyticsCall = calls.find((c) => c.url === ANALYTICS_URL);
    expect(analyticsCall).toBeDefined();
    const headers = analyticsCall!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key-xyz');
    const body = JSON.parse(analyticsCall!.init?.body as string);
    expect(body).toMatchObject({
      event: 'activity_score_calculated',
      user_id: 'u1',
      latitude: 40.71,
      longitude: -74.01,
      score: 100,
    });
    expect(typeof body.timestamp).toBe('string');
    expect(body.timestamp).toMatch(/Z$/);
  });

  it('validation gate: lat=999 → 400 with field message; zero outbound fetch calls', async () => {
    const { calls } = installFetchMock(async () => {
      throw new Error('should not be called');
    });

    const { app } = makeTestApp();
    const res = await request(app).get('/api/v1/activity-score?lat=999&lon=-74.01');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
    const fields = res.body.fields as Array<{ path: string; message: string }>;
    expect(fields.some((f) => f.path === 'lat')).toBe(true);
    expect(calls.length).toBe(0);
  });

  it('upstream timeout: open-meteo never resolves before AbortSignal → 500 in <5.5s', async () => {
    installFetchMock(async (url, init) => {
      if (url.startsWith(WEATHER_HOST)) {
        // Hang and honor the caller's AbortSignal so the service's timeout
        // can actually fire and reject this promise.
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abortError = () =>
            (signal?.reason as Error | undefined) ??
            new DOMException('The operation was aborted.', 'AbortError');
          if (signal?.aborted) {
            reject(abortError());
            return;
          }
          signal?.addEventListener('abort', () => reject(abortError()));
        });
      }
      if (url.startsWith(AIR_QUALITY_HOST)) return jsonResponse(VALID_AIR_QUALITY);
      throw new Error(`unexpected url: ${url}`);
    });

    const { app } = makeTestApp();
    const start = Date.now();
    const res = await request(app).get('/api/v1/activity-score?lat=40.71&lon=-74.01');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
    // Confirm we timed out near the configured budget, not earlier (instant rejection)
    // and not later (signal not honored).
    expect(elapsed).toBeGreaterThanOrEqual(config.UPSTREAM_TIMEOUT_MS - 200);
    expect(elapsed).toBeLessThan(config.UPSTREAM_TIMEOUT_MS + 500);
  }, 10_000);

  it('analytics is fire-and-forget: client gets 200 even when analytics is slow/failing', async () => {
    const analyticsGate = Promise.withResolvers<Response>();
    let analyticsStarted = false;
    installFetchMock(async (url) => {
      if (url.startsWith(WEATHER_HOST)) return jsonResponse(VALID_WEATHER);
      if (url.startsWith(AIR_QUALITY_HOST)) return jsonResponse(VALID_AIR_QUALITY);
      if (url === ANALYTICS_URL) {
        analyticsStarted = true;
        return analyticsGate.promise;
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const { app } = makeTestApp();
    const start = Date.now();
    const res = await request(app).get('/api/v1/activity-score?lat=40.71&lon=-74.01&user_id=u1');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500); // not waiting on analytics
    expect(analyticsStarted).toBe(true); // call was issued

    // Now resolve analytics with a 500 — handler should log warn but not crash.
    analyticsGate.resolve(jsonResponse({ err: 'fail' }, 500));
    await analyticsGate.promise;
  });

  it('user_id missing: analytics still fired exactly once with user_id: null', async () => {
    const analyticsResolved = Promise.withResolvers<void>();
    const { calls } = installFetchMock(async (url) => {
      if (url.startsWith(WEATHER_HOST)) return jsonResponse(VALID_WEATHER);
      if (url.startsWith(AIR_QUALITY_HOST)) return jsonResponse(VALID_AIR_QUALITY);
      if (url === ANALYTICS_URL) {
        analyticsResolved.resolve();
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const { app } = makeTestApp();
    const res = await request(app).get('/api/v1/activity-score?lat=40.71&lon=-74.01');
    expect(res.status).toBe(200);
    await analyticsResolved.promise;

    const analyticsCalls = calls.filter((c) => c.url === ANALYTICS_URL);
    expect(analyticsCalls).toHaveLength(1);
    const body = JSON.parse(analyticsCalls[0]!.init?.body as string);
    expect(body.user_id).toBeNull();
  });

  it('cache: fresh hit avoids upstream; expired entry + upstream failure serves stale', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let upstreamMode: 'ok' | 'fail' = 'ok';

    const { calls } = installFetchMock(async (url) => {
      if (url === ANALYTICS_URL) return jsonResponse({ ok: true });
      if (upstreamMode === 'fail') throw new Error('open-meteo down');
      if (url.startsWith(WEATHER_HOST)) return jsonResponse(VALID_WEATHER);
      if (url.startsWith(AIR_QUALITY_HOST)) return jsonResponse(VALID_AIR_QUALITY);
      throw new Error(`unexpected url: ${url}`);
    });

    const { app } = makeTestApp();
    const url = '/api/v1/activity-score?lat=12.34&lon=56.78';

    // 1. cold cache → 1 weather + 1 air-quality call
    const first = await request(app).get(url);
    expect(first.status).toBe(200);
    expect(calls.filter((c) => c.url.startsWith(WEATHER_HOST))).toHaveLength(1);
    expect(calls.filter((c) => c.url.startsWith(AIR_QUALITY_HOST))).toHaveLength(1);

    // 2. fresh hit → no new upstream calls, identical response
    const second = await request(app).get(url);
    expect(second.status).toBe(200);
    expect(calls.filter((c) => c.url.startsWith(WEATHER_HOST))).toHaveLength(1);
    expect(second.body.score).toBe(first.body.score);

    // 3. expire fresh window + break upstream → stale served, no 5xx
    vi.advanceTimersByTime(6 * 60 * 1000);
    upstreamMode = 'fail';
    const stale = await request(app).get(url);
    expect(stale.status).toBe(200);
    expect(stale.body.score).toBe(first.body.score);

    vi.useRealTimers();
  });
});
