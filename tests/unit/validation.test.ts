import { describe, it, expect } from 'vitest';
import { normalizeUrl, ValidationError, MAX_URL_LENGTH } from '../../src/lib/validation';

describe('normalizeUrl', () => {
  it('accepts http and https URLs', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeUrl('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1',
    );
  });

  it('normalizes equivalent inputs (host case, trailing slash)', () => {
    expect(normalizeUrl('https://Example.COM')).toBe('https://example.com/');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com/');
  });

  it.each([
    ['not a string', 42],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
  ])('rejects non-string input (%s)', (_label, input) => {
    expect(() => normalizeUrl(input)).toThrow(ValidationError);
  });

  it('rejects empty / whitespace-only input', () => {
    expect(() => normalizeUrl('')).toThrow(ValidationError);
    expect(() => normalizeUrl('   ')).toThrow(ValidationError);
  });

  it('rejects malformed URLs', () => {
    expect(() => normalizeUrl('not-a-url')).toThrow(ValidationError);
    expect(() => normalizeUrl('http://')).toThrow(ValidationError);
  });

  it.each(['ftp://example.com', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd'])(
    'rejects disallowed scheme: %s',
    (input) => {
      expect(() => normalizeUrl(input)).toThrow(/http or https/);
    },
  );

  it('rejects URLs longer than the max length', () => {
    const longUrl = `https://example.com/${'a'.repeat(MAX_URL_LENGTH)}`;
    expect(() => normalizeUrl(longUrl)).toThrow(/at most/);
  });
});
