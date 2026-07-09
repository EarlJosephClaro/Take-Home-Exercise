import { describe, it, expect } from 'vitest';
import { generateShortCode, DEFAULT_CODE_LENGTH } from '../../src/lib/shortCode';

const BASE62 = /^[0-9A-Za-z]+$/;

describe('generateShortCode', () => {
  it('produces a code of the default length', () => {
    expect(generateShortCode()).toHaveLength(DEFAULT_CODE_LENGTH);
  });

  it('honors a custom length', () => {
    expect(generateShortCode(12)).toHaveLength(12);
    expect(generateShortCode(1)).toHaveLength(1);
  });

  it('only uses base62 characters', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateShortCode()).toMatch(BASE62);
    }
  });

  it('is effectively collision-free across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(generateShortCode());
    }
    // With 62^7 keyspace, 10k draws should essentially never collide.
    expect(seen.size).toBe(10_000);
  });

  it('rejects invalid lengths', () => {
    expect(() => generateShortCode(0)).toThrow();
    expect(() => generateShortCode(-3)).toThrow();
    expect(() => generateShortCode(2.5)).toThrow();
  });
});
