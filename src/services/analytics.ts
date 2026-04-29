import type { Logger } from '../logger.js';
import { config } from '../config.js';

const ANALYTICS_TIMEOUT_MS = 2000;

export interface AnalyticsEvent {
  userId: string | undefined;
  lat: number;
  lon: number;
  score: number;
}

export function saveStatistics(event: AnalyticsEvent, log: Logger): void {
  const payload = {
    event: 'activity_score_calculated',
    user_id: event.userId ?? null,
    latitude: event.lat,
    longitude: event.lon,
    score: event.score,
    timestamp: new Date().toISOString(),
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.ANALYTICS_API_KEY) {
    headers.Authorization = `Bearer ${config.ANALYTICS_API_KEY}`;
  }

  void (async () => {
    try {
      const resp = await fetch(config.ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
      });
      if (!resp.ok) {
        log.warn({ status: resp.status }, 'analytics_post_non_ok');
      }
    } catch (err) {
      log.warn({ err }, 'analytics_post_failed');
    }
  })();
}
