import { describe, it, expect } from 'vitest';
import {
  formatDay,
  windowStartDay,
  buildDailySeries,
  STATS_WINDOW_DAYS,
} from '../../src/lib/stats';

describe('formatDay', () => {
  it('formats a Date as a UTC YYYY-MM-DD string', () => {
    expect(formatDay(new Date('2026-07-09T13:45:00Z'))).toBe('2026-07-09');
  });

  it('uses UTC, not local time', () => {
    // Late UTC on the 9th is still the 9th regardless of local offset.
    expect(formatDay(new Date('2026-07-09T23:59:59Z'))).toBe('2026-07-09');
  });
});

describe('windowStartDay', () => {
  it('returns end - 29 days for the default 30-day window', () => {
    expect(windowStartDay(new Date('2026-07-30T00:00:00Z'))).toBe('2026-07-01');
  });

  it('honors a custom window size', () => {
    expect(windowStartDay(new Date('2026-07-30T00:00:00Z'), 7)).toBe('2026-07-24');
  });
});

describe('buildDailySeries', () => {
  const end = new Date('2026-07-09T12:00:00Z');

  it('returns exactly STATS_WINDOW_DAYS entries, oldest first', () => {
    const series = buildDailySeries(new Map(), end);
    expect(series).toHaveLength(STATS_WINDOW_DAYS);
    expect(series[0]?.date).toBe('2026-06-10'); // 29 days before the 9th
    expect(series.at(-1)?.date).toBe('2026-07-09');
  });

  it('fills days with no data as zero', () => {
    const series = buildDailySeries(new Map(), end);
    expect(series.every((d) => d.hits === 0)).toBe(true);
  });

  it('maps recorded counts onto the correct days', () => {
    const counts = new Map([
      ['2026-07-09', 5],
      ['2026-07-05', 2],
    ]);
    const series = buildDailySeries(counts, end);
    expect(series.at(-1)).toEqual({ date: '2026-07-09', hits: 5 });
    expect(series.find((d) => d.date === '2026-07-05')?.hits).toBe(2);
    expect(series.find((d) => d.date === '2026-07-06')?.hits).toBe(0);
  });

  it('ignores counts outside the window', () => {
    const counts = new Map([['2026-01-01', 99]]);
    const series = buildDailySeries(counts, end);
    expect(series.reduce((sum, d) => sum + d.hits, 0)).toBe(0);
  });
});
