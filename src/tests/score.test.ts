import { describe, it, expect } from 'vitest';
import { calculateOutdoorScore } from '../services/score.js';

describe('calculateOutdoorScore', () => {
  // [temp, wind, pm25, pm10, expected, label]
  const cases: Array<[number, number, number, number, number, string]> = [
    [20, 5, 5, 10, 100, 'ideal'],
    [12, 25, 18, 60, 60, 'mid-band penalties stack: cool + windy + pm25 + pm10'],
    [5, 35, 60, 110, 0, 'worst case clamps to 0'],
    [35, 5, 5, 10, 70, 'hot edge: temp > 32 (-30)'],
    [20, 5, 30, 10, 85, 'pm25 25-50 (-15)'],
  ];

  for (const [temp, wind, pm25, pm10, expected, label] of cases) {
    it(`${label} → ${expected}`, () => {
      const score = calculateOutdoorScore(
        { current_weather: { temperature: temp, windspeed: wind } },
        { current: { pm2_5: pm25, pm10 } },
      );
      expect(score).toBe(expected);
    });
  }
});
