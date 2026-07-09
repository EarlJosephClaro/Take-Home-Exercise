import type { Statement } from 'better-sqlite3';
import type { DB } from '../db';
import { generateShortCode } from '../lib/shortCode';
import {
  buildDailySeries,
  formatDay,
  STATS_WINDOW_DAYS,
  windowStartDay,
  type DailyHit,
} from '../lib/stats';

/** A shortened URL as stored. */
export interface UrlRecord {
  id: number;
  short_code: string;
  original_url: string;
  created_at: string;
}

/** Aggregated stats for a short code. */
export interface UrlStats {
  short_code: string;
  original_url: string;
  created_at: string;
  /** All-time total hits (may exceed the sum of `daily` — see below). */
  total_hits: number;
  /**
   * Dense per-day breakdown for the last {@link STATS_WINDOW_DAYS} days,
   * oldest first. Note: `total_hits` counts *all* history, whereas `daily`
   * only covers the recent window, so `total_hits` can be larger than the
   * sum of `daily` for links older than the window.
   */
  daily: DailyHit[];
}

/** Max attempts to find a non-colliding short code before giving up. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Data-access layer for URLs and click stats.
 *
 * Statements are prepared once in the constructor and reused. All methods are
 * synchronous because better-sqlite3 is synchronous — which for this workload
 * is a feature: no connection pool, no callback/promise plumbing, and each
 * operation is a single fast in-process call.
 */
export class UrlStore {
  private readonly insertUrl: Statement<[string, string]>;
  private readonly selectByCode: Statement<[string]>;
  private readonly incrementClick: Statement<[number, string]>;
  private readonly sumHits: Statement<[number]>;
  private readonly dailyHits: Statement<[number, string]>;

  constructor(private readonly db: DB) {
    this.insertUrl = db.prepare(
      'INSERT INTO urls (short_code, original_url) VALUES (?, ?)',
    );
    this.selectByCode = db.prepare('SELECT * FROM urls WHERE short_code = ?');
    this.incrementClick = db.prepare(`
      INSERT INTO clicks (url_id, day, count) VALUES (?, ?, 1)
      ON CONFLICT (url_id, day) DO UPDATE SET count = count + 1
    `);
    this.sumHits = db.prepare(
      'SELECT COALESCE(SUM(count), 0) AS total FROM clicks WHERE url_id = ?',
    );
    this.dailyHits = db.prepare(
      'SELECT day, count FROM clicks WHERE url_id = ? AND day >= ? ORDER BY day',
    );
  }

  /**
   * Persist `originalUrl` under a fresh random short code and return it.
   * Retries on the (astronomically unlikely) event of a code collision.
   */
  createShortUrl(originalUrl: string): string {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateShortCode();
      try {
        this.insertUrl.run(code, originalUrl);
        return code;
      } catch (err) {
        if (isUniqueViolation(err) && attempt < MAX_CODE_ATTEMPTS - 1) {
          continue; // collision — try another code
        }
        throw err;
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new Error('exhausted short code generation attempts');
  }

  /** Look up a URL by its short code, or `undefined` if unknown. */
  findByCode(code: string): UrlRecord | undefined {
    return this.selectByCode.get(code) as UrlRecord | undefined;
  }

  /** Record one hit against `urlId` for the UTC day of `when`. */
  recordHit(urlId: number, when: Date): void {
    this.incrementClick.run(urlId, formatDay(when));
  }

  /**
   * Compute stats for `code`, or `undefined` if the code is unknown.
   * `now` defines the end of the reporting window (defaults to the wall clock;
   * injectable for deterministic tests).
   */
  getStats(code: string, now: Date): UrlStats | undefined {
    const url = this.findByCode(code);
    if (!url) return undefined;

    const { total } = this.sumHits.get(url.id) as { total: number };

    const rows = this.dailyHits.all(url.id, windowStartDay(now)) as Array<{
      day: string;
      count: number;
    }>;
    const counts = new Map(rows.map((r) => [r.day, r.count]));

    return {
      short_code: url.short_code,
      original_url: url.original_url,
      created_at: url.created_at,
      total_hits: total,
      daily: buildDailySeries(counts, now, STATS_WINDOW_DAYS),
    };
  }
}

/** True if `err` is a SQLite UNIQUE-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
