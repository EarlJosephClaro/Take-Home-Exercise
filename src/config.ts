import { resolve } from 'node:path';

/**
 * Runtime configuration, resolved once from environment variables.
 *
 * Everything is overridable via env so the same build runs unchanged in local
 * dev, tests, and Docker (see .env.example).
 */

const port = Number(process.env.PORT ?? 3000);

export interface Config {
  /** Port the HTTP server listens on. */
  port: number;
  /** Origin used to build the `short_url` returned by POST /shorten. */
  baseUrl: string;
  /** Filesystem path to the SQLite database file (or ':memory:'). */
  dbPath: string;
  /** Directory of static assets for the web UI. */
  publicDir: string;
}

export const config: Config = {
  port,
  baseUrl: (process.env.BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
  dbPath: process.env.DB_PATH ?? './data/urls.db',
  // Resolves to <project>/public whether running from src (tsx) or dist (node).
  publicDir: process.env.PUBLIC_DIR ?? resolve(__dirname, '..', 'public'),
};
