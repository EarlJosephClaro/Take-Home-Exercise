import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

/**
 * Schema.
 *
 *  - `urls`   — one row per shortened link.
 *  - `clicks` — pre-aggregated daily counters, one row per (url, UTC day).
 *
 * We aggregate clicks by day at write time (an UPSERT increment) rather than
 * storing one row per hit. This keeps storage O(urls × active days) instead of
 * O(total hits), and makes the per-day stats query a trivial indexed range
 * scan. The tradeoff — losing per-hit granularity (referrer, exact time) — is
 * acceptable for the required stats and noted in the README.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS urls (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  short_code   TEXT    NOT NULL UNIQUE,
  original_url TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS clicks (
  url_id INTEGER NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
  day    TEXT    NOT NULL,               -- UTC calendar day, YYYY-MM-DD
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (url_id, day)
);

CREATE INDEX IF NOT EXISTS idx_clicks_url_day ON clicks (url_id, day);
`;

/**
 * Open (or create) the SQLite database at `path`, apply pragmas and migrations,
 * and return a ready-to-use connection.
 *
 * Pass ':memory:' for an ephemeral database (used by the test suite).
 */
export function createDb(path: string): DB {
  if (path !== ':memory:') {
    // better-sqlite3 will not create intermediate directories.
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  // WAL improves read/write concurrency (readers don't block the writer).
  db.pragma('journal_mode = WAL');
  // Enforce the clicks -> urls foreign key (off by default in SQLite).
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA);
  return db;
}
