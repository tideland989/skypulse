import { z } from 'zod';

// Lenient by design: mirrors the Python's `.get(key, default)` chains so
// Open-Meteo error payloads (200 + `{error: true}`) flow through to the
// score-time defaults instead of failing parse.
export const WeatherResponseSchema = z.object({
  current_weather: z
    .object({
      temperature: z.number().nullable().optional(),
      windspeed: z.number().nullable().optional(),
      weathercode: z.number().nullable().optional(),
    })
    .optional(),
});

export const AirQualityResponseSchema = z.object({
  current: z
    .object({
      pm2_5: z.number().nullable().optional(),
      pm10: z.number().nullable().optional(),
    })
    .optional(),
});

export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;
export type AirQualityResponse = z.infer<typeof AirQualityResponseSchema>;
