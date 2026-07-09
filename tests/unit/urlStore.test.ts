import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, type DB } from '../../src/db';
import { UrlStore } from '../../src/store/urlStore';

describe('UrlStore', () => {
  let db: DB;
  let store: UrlStore;

  beforeEach(() => {
    db = createDb(':memory:');
    store = new UrlStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a short code and reads it back', () => {
    const code = store.createShortUrl('https://example.com/');
    expect(code).toMatch(/^[0-9A-Za-z]{7}$/);

    const record = store.findByCode(code);
    expect(record?.original_url).toBe('https://example.com/');
    expect(record?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('issues distinct codes for repeated URLs (no dedup)', () => {
    const a = store.createShortUrl('https://example.com/');
    const b = store.createShortUrl('https://example.com/');
    expect(a).not.toBe(b);
  });

  it('returns undefined for an unknown code', () => {
    expect(store.findByCode('missing')).toBeUndefined();
    expect(store.getStats('missing', new Date())).toBeUndefined();
  });

  it('aggregates hits per UTC day', () => {
    const code = store.createShortUrl('https://example.com/');
    const { id } = store.findByCode(code)!;

    const now = new Date('2026-07-09T10:00:00Z');
    const fiveDaysAgo = new Date('2026-07-04T10:00:00Z');

    store.recordHit(id, now);
    store.recordHit(id, now);
    store.recordHit(id, now);
    store.recordHit(id, fiveDaysAgo);

    const stats = store.getStats(code, now)!;
    expect(stats.total_hits).toBe(4);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.at(-1)).toEqual({ date: '2026-07-09', hits: 3 });
    expect(stats.daily.find((d) => d.date === '2026-07-04')?.hits).toBe(1);
    expect(stats.daily.find((d) => d.date === '2026-07-08')?.hits).toBe(0);
  });

  it('counts all-time total but only reports the last 30 days in the breakdown', () => {
    const code = store.createShortUrl('https://example.com/');
    const { id } = store.findByCode(code)!;

    const now = new Date('2026-07-09T10:00:00Z');
    const longAgo = new Date('2026-05-01T10:00:00Z'); // > 30 days before now

    store.recordHit(id, longAgo);
    store.recordHit(id, now);
    store.recordHit(id, now);

    const stats = store.getStats(code, now)!;
    // total counts the old hit...
    expect(stats.total_hits).toBe(3);
    // ...but the 30-day window sums to only the recent hits.
    const windowSum = stats.daily.reduce((sum, d) => sum + d.hits, 0);
    expect(windowSum).toBe(2);
  });
});
