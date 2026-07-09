/** A single day's click count in a stats breakdown. */
export interface DailyHit {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  hits: number;
}

export const STATS_WINDOW_DAYS = 30;

/**
 * Format a Date as a UTC calendar day (`YYYY-MM-DD`).
 *
 * We bucket clicks by UTC day everywhere so results are stable regardless of
 * the server's local timezone and are trivially testable.
 */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The inclusive start day of the stats window ending at `endDay`.
 * For a 30-day window this is `endDay - 29 days`.
 */
export function windowStartDay(endDay: Date, days: number = STATS_WINDOW_DAYS): string {
  const start = new Date(endDay);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return formatDay(start);
}

/**
 * Build a dense, chronologically ordered series covering the last `days` days
 * up to and including `endDay`. Days with no recorded clicks are filled with
 * zero, so the caller always gets exactly `days` entries — convenient for
 * charting and predictable for clients.
 *
 * @param counts map of `YYYY-MM-DD` -> click count (sparse; only non-zero days)
 */
export function buildDailySeries(
  counts: Map<string, number>,
  endDay: Date,
  days: number = STATS_WINDOW_DAYS,
): DailyHit[] {
  const series: DailyHit[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDay);
    d.setUTCDate(d.getUTCDate() - i);
    const date = formatDay(d);
    series.push({ date, hits: counts.get(date) ?? 0 });
  }
  return series;
}
