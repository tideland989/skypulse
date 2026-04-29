import { DatabaseSync } from 'node:sqlite';
import { prepareStatements, wrap, type DbHandle } from '../db.js';
import { createApp } from '../server.js';
import { logger } from '../logger.js';

const SCHEMA = `
  CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    preference_type TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_user_preferences_location_id ON user_preferences(location_id);
`;

const FIXTURE = [
  ['u1', '40.71,-74.01', 'activity_type', 'running'],
  ['u1', '40.71,-74.01', 'wind_sensitivity', 'medium'],
  ['u2', '34.05,-118.24', 'activity_type', 'cycling'],
  ['u3', '51.51,-0.13', 'activity_type', 'walking'],
];

export function makeTestApp(): { app: ReturnType<typeof createApp>; db: DbHandle } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  const insert = sqlite.prepare(
    'INSERT INTO user_preferences (user_id, location_id, preference_type, preference_value) VALUES (?, ?, ?, ?)',
  );
  for (const row of FIXTURE) insert.run(...row);
  const stmts = prepareStatements(sqlite);
  const db = wrap(sqlite, stmts);
  const app = createApp({ db, logger });
  return { app, db };
}

export const VALID_WEATHER = {
  current_weather: { temperature: 20, windspeed: 5, weathercode: 1 },
};

export const VALID_AIR_QUALITY = {
  current: { pm2_5: 8, pm10: 20 },
};

/** Build a Response-like object that fetch returns. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
