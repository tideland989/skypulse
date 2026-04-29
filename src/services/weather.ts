import { LRUCache } from 'lru-cache';
import { type ZodType } from 'zod';
import { config } from '../config.js';
import {
  WeatherResponseSchema,
  AirQualityResponseSchema,
  type WeatherResponse,
  type AirQualityResponse,
} from '../schemas/activityScore.js';

export class UpstreamError extends Error {
  override readonly name = 'UpstreamError';
  readonly dependency: string;
  constructor(dependency: string, cause: unknown, message?: string) {
    super(message ?? `${dependency} unavailable`, { cause });
    this.dependency = dependency;
  }
}
const FRESH_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 10_000;

const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const cacheKey = (lat: number, lon: number): string => `${lat.toFixed(2)},${lon.toFixed(2)}`;

async function fetchJson(url: string, dependency: string): Promise<unknown> {
  // No `resp.ok` gate: matches Python's `requests.get(...).json()` shape so
  // JSON-bodied error responses flow through to the lenient schema instead
  // of failing here. Only network errors and non-JSON bodies throw.
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(config.UPSTREAM_TIMEOUT_MS) });
  } catch (err) {
    throw new UpstreamError(dependency, err);
  }
  try {
    return await resp.json();
  } catch (err) {
    throw new UpstreamError(dependency, err, `${dependency} returned non-JSON body`);
  }
}

interface UpstreamSpec<T extends object> {
  dependency: string;
  buildUrl: (lat: number, lon: number) => string;
  schema: ZodType<T>;
}

// Per-upstream LRU so a weather outage can't poison air-quality entries.
// LRUCache.fetch gives us in-flight dedup, fresh-window TTL, and
// stale-on-error fallback (allowStaleOnFetchRejection +
// noDeleteOnFetchRejection). Cold cache + upstream failure is the only
// path that throws.
const allCaches: Array<{ clear: () => void }> = [];

function makeCachedUpstream<T extends object>(
  spec: UpstreamSpec<T>,
): (lat: number, lon: number) => Promise<T> {
  const cache = new LRUCache<string, T>({
    max: MAX_ENTRIES,
    ttl: FRESH_TTL_MS,
    allowStaleOnFetchRejection: true,
    noDeleteOnFetchRejection: true,
    fetchMethod: async (key) => {
      const [latStr, lonStr] = key.split(',');
      const url = spec.buildUrl(Number(latStr), Number(lonStr));
      const raw = await fetchJson(url, spec.dependency);
      const parsed = spec.schema.safeParse(raw);
      if (!parsed.success) {
        throw new UpstreamError(
          spec.dependency,
          parsed.error,
          `${spec.dependency} returned unexpected payload`,
        );
      }
      return parsed.data;
    },
  });
  allCaches.push(cache);

  return async (lat, lon) => {
    const result = await cache.fetch(cacheKey(lat, lon));
    if (result === undefined) {
      throw new UpstreamError(spec.dependency, new Error('upstream failed and no cached entry'));
    }
    return result;
  };
}

export const getWeather = makeCachedUpstream<WeatherResponse>({
  dependency: 'open-meteo',
  schema: WeatherResponseSchema,
  buildUrl: (lat, lon) =>
    `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}&current_weather=true`,
});

export const getAirQuality = makeCachedUpstream<AirQualityResponse>({
  dependency: 'open-meteo-air-quality',
  schema: AirQualityResponseSchema,
  buildUrl: (lat, lon) =>
    `${AIR_QUALITY_BASE}?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5`,
});

/** Test-only — clear every cache the factory created. */
export function _resetCachesForTest(): void {
  for (const c of allCaches) c.clear();
}
