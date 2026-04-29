#!/usr/bin/env tsx
// Port of seed_db.py with the missing location_id index added.
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const CITIES: ReadonlyArray<readonly [string, string]> = [
  ['40.71,-74.01', 'New York'],
  ['34.05,-118.24', 'Los Angeles'],
  ['41.88,-87.63', 'Chicago'],
  ['29.76,-95.37', 'Houston'],
  ['33.45,-112.07', 'Phoenix'],
  ['47.61,-122.33', 'Seattle'],
  ['51.51,-0.13', 'London'],
  ['48.86,2.35', 'Paris'],
  ['35.68,139.69', 'Tokyo'],
  ['-33.87,151.21', 'Sydney'],
];

const PREFERENCE_TYPES = [
  'activity_type',
  'notification_enabled',
  'temperature_unit',
  'wind_sensitivity',
  'air_quality_threshold',
  'preferred_time',
  'weekly_goal',
] as const;
type PrefType = (typeof PREFERENCE_TYPES)[number];

const ACTIVITY_VALUES = ['running', 'cycling', 'hiking', 'walking', 'swimming', 'tennis', 'golf', 'yoga'];
const BOOL_VALUES = ['true', 'false'];
const TEMP_UNITS = ['celsius', 'fahrenheit'];
const SENSITIVITY_VALUES = ['low', 'medium', 'high'];
const TIME_VALUES = ['morning', 'afternoon', 'evening', 'any'];

function pick<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function getRandomValue(prefType: PrefType): string {
  switch (prefType) {
    case 'activity_type':
      return pick(ACTIVITY_VALUES);
    case 'notification_enabled':
      return pick(BOOL_VALUES);
    case 'temperature_unit':
      return pick(TEMP_UNITS);
    case 'wind_sensitivity':
      return pick(SENSITIVITY_VALUES);
    case 'air_quality_threshold':
      return String(randInt(15, 100));
    case 'preferred_time':
      return pick(TIME_VALUES);
    case 'weekly_goal':
      return String(randInt(1, 7));
  }
}

function generateLocationVariations(baseLat: number, baseLon: number, count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const lat = baseLat + randFloat(-0.5, 0.5);
    const lon = baseLon + randFloat(-0.5, 0.5);
    out.push(`${lat.toFixed(2)},${lon.toFixed(2)}`);
  }
  return out;
}

function sample<T>(arr: ReadonlyArray<T>, n: number): T[] {
  const copy = arr.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

function main(): void {
  const db = new DatabaseSync(config.DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      preference_type TEXT NOT NULL,
      preference_value TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Index for the location_id lookup that runs on every /activity-score call.
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_user_preferences_location_id ON user_preferences(location_id)',
  );

  // Idempotent: skip when the table already has rows so the docker entrypoint
  // can call this on every container start without nuking persisted data.
  const { c: existing } = db
    .prepare('SELECT COUNT(*) AS c FROM user_preferences')
    .get() as { c: number };
  if (existing > 0) {
    // eslint-disable-next-line no-console
    console.log(`DB already has ${existing} rows; skipping seed.`);
    db.close();
    return;
  }

  // eslint-disable-next-line no-console
  console.log('Generating user preference records...');

  const insert = db.prepare(
    'INSERT INTO user_preferences (user_id, location_id, preference_type, preference_value) VALUES (?, ?, ?, ?)',
  );

  let recordCount = 0;
  let total = 0;

  db.exec('BEGIN');
  try {
    for (const [cityCoords] of CITIES) {
      const [latStr, lonStr] = cityCoords.split(',');
      const baseLat = Number(latStr);
      const baseLon = Number(lonStr);
      const locations = generateLocationVariations(baseLat, baseLon, 10);

      for (const locationId of locations) {
        const numUsers = randInt(5, 10);
        for (let userNum = 0; userNum < numUsers; userNum++) {
          const userId = `user_${recordCount}_${userNum}`;
          const numPrefs = randInt(2, 4);
          const selected = sample(PREFERENCE_TYPES, numPrefs);
          for (const prefType of selected) {
            insert.run(userId, locationId, prefType, getRandomValue(prefType));
            total++;
          }
        }
        recordCount++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // eslint-disable-next-line no-console
  console.log(`Created ${total} records in ${config.DB_PATH}`);
  db.close();
}

main();
