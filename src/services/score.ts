import type { WeatherResponse, AirQualityResponse } from '../schemas/activityScore.js';

// Defaults are load-bearing: they're the documented behavior when Open-Meteo
// returns an error payload (the Python's `.get(key, default)` fallback).
export function calculateOutdoorScore(
  weather: WeatherResponse,
  airQuality: AirQualityResponse,
): number {
  let score = 100;

  const temp = weather.current_weather?.temperature ?? 20;
  const wind = weather.current_weather?.windspeed ?? 0;

  if (temp < 10 || temp > 32) {
    score -= 30;
  } else if (temp < 15 || temp > 28) {
    score -= 15;
  }

  if (wind > 30) {
    score -= 25;
  } else if (wind > 20) {
    score -= 10;
  }

  const pm25 = airQuality.current?.pm2_5 ?? 0;
  const pm10 = airQuality.current?.pm10 ?? 0;

  if (pm25 > 50) {
    score -= 30;
  } else if (pm25 > 25) {
    score -= 15;
  } else if (pm25 > 15) {
    score -= 5;
  }

  if (pm10 > 100) {
    score -= 20;
  } else if (pm10 > 50) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function recommendationFor(score: number): string {
  if (score < 50) return 'Consider indoor activities today';
  if (score < 70) return 'Moderate conditions - light outdoor activities recommended';
  return 'Good conditions for outdoor activities';
}
