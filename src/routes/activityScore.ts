import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getWeather, getAirQuality } from '../services/weather.js';
import { calculateOutdoorScore, recommendationFor } from '../services/score.js';
import { saveStatistics } from '../services/analytics.js';
import type { DbHandle } from '../db.js';
import type { Logger } from '../logger.js';

// Brittle 2-decimal string key — preserved from the original until product
// confirms the lookup strategy.
const locationKey = (lat: number, lon: number): string =>
  `${lat.toFixed(2)},${lon.toFixed(2)}`;

// Range validation only. Presence/numeric checks below produce Python's
// exact error strings; out-of-range is deliberate request-contract divergence.
const RangeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function activityScoreRouter(deps: { db: DbHandle; logger: Logger }): Router {
  const router = Router();

  router.get(
    '/activity-score',
    async (req: Request, res: Response, next: NextFunction) => {
      const lat = asString(req.query.lat);
      const lon = asString(req.query.lon);
      const userId = asString(req.query.user_id);

      // Python parity: missing or empty string both yield this message.
      if (!lat || !lon) {
        res.status(400).json({ error: 'lat and lon are required' });
        return;
      }

      const latNum = Number(lat);
      const lonNum = Number(lon);
      if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
        res.status(400).json({ error: 'lat and lon must be numbers' });
        return;
      }

      const range = RangeSchema.safeParse({ lat: latNum, lon: lonNum });
      if (!range.success) {
        next(range.error);
        return;
      }
      const { lat: validLat, lon: validLon } = range.data;

      const [weather, airQuality] = await Promise.all([
        getWeather(validLat, validLon),
        getAirQuality(validLat, validLon),
      ]);

      const score = calculateOutdoorScore(weather, airQuality);

      // TODO: dead read, result intentionally discarded, awaiting product decision on whether preferences should adjust the score.
      deps.db.stmts.preferencesByLocation.all(locationKey(validLat, validLon));

      const recommendation = recommendationFor(score);

      saveStatistics({ userId, lat: validLat, lon: validLon, score }, req.log ?? deps.logger);

      res.json({
        score,
        recommendation,
        weather: {
          temperature: weather.current_weather?.temperature ?? null,
          wind_speed: weather.current_weather?.windspeed ?? null,
          conditions: weather.current_weather?.weathercode ?? null,
        },
        air_quality: {
          pm2_5: airQuality.current?.pm2_5 ?? null,
          pm10: airQuality.current?.pm10 ?? null,
        },
      });
    },
  );

  return router;
}
