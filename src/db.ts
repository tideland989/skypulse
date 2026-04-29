import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export type DB = DatabaseSync;

export interface PreparedStatements {
  preferencesByLocation: ReturnType<DatabaseSync['prepare']>;
  distinctLocations: ReturnType<DatabaseSync['prepare']>;
}

export interface DbHandle {
  db: DB;
  stmts: PreparedStatements;
  close(): void;
}

export function applyPragmas(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA optimize");
}

export function prepareStatements(db: DatabaseSync): PreparedStatements {
  return {
    // TODO: dead read, not scoped to user_id; preserved verbatim
    // pending product decision.
    preferencesByLocation: db.prepare(
      'SELECT preference_type, preference_value FROM user_preferences WHERE location_id = ?',
    ),
    // No ORDER BY: matches the original. Adding one would change which 100
    // rows clients see when there are >100 distinct locations.
    distinctLocations: db.prepare(
      'SELECT DISTINCT location_id FROM user_preferences LIMIT 100',
    ),
  };
}

export function wrap(db: DatabaseSync, stmts: PreparedStatements): DbHandle {
  return { db, stmts, close: () => db.close() };
}

export function openDb(path: string = config.DB_PATH): DbHandle {
  const db = new DatabaseSync(path);
  applyPragmas(db);
  return wrap(db, prepareStatements(db));
}
